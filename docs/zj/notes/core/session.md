# 1-4-1 精读笔记：`@deepseek-ai/dsh-session`

> 包路径 `packages/core/session/` ｜ 源码 `src/`（9 文件，3156 行）｜ 测试 `tests/`（13 文件）
> 精读日期：2026-08-15 ｜ 定位：**事件溯源日志 + 模型可见 surface 派生 + 内存 store**

## 一句话定位

Session 是一个 **append-only 事件日志**（`seq = log.length` 连续契约），配一个**增量维护的 surface 层**（只有三种 message-producing 事件能进模型可见历史），以及一个内存 `SessionStore`（`ctx.sessions`）。**持久化故意不实现**——持久化插件订阅 `session/event`、在 `session/flush`/dispose 时落盘。`Session` 类不是 Service，不带生命周期；它只是数据容器 + 发布钩子。

## 公开面

- **Service**：`ctx.sessions`（`SessionStore extends Service`）
- **Session 类**（非 Service）：`create(id, seed, header)` / `fromRestore(id, events, meta)` / `append(type, data, opts)` / `events`（快照 getter）/ `seq` / `requestHeader()` / `requestContext()` / `deriveMessages()` / `surface`（nodes + replaceGeneration）
- **SessionStore**：`create(id?, options?)` / `prepare(id?, options?)` + `enter(session)` + `announce(session)` / `get` / `list` / `fork(source, boundary?, childId?)` / `flush(session)`
- **类型**：`SessionId`（branded string）、`SessionEvent` 判别联合（13 类型）、`EpochHeader`、`SurfaceEventType`（3 类型）、`SurfaceOp`（`'append' | {op:'replace',start,end}`）、`SessionForkError`（5 种 code）
- **事件**（SessionEventMap 13 类型 + store 生命周期 3 事件 + flush）：见下表

## 事件词汇（13 种 session event）

| 类型 | 语义 |
|---|---|
| `turn/start` / `turn/end` | turn 生命周期边界 |
| `step/start` / `step/end` | step 边界 |
| `user/message` | **surface 事件**：用户/注入上下文，verbatim 投影 |
| `assistant/chunk` | 流式 chunk，**不进 surface**（trace 数据） |
| `assistant/message` | **surface 事件**；空 content 的（max-tokens usage 宿主）derive 为 null |
| `tool/call` | 工具调用记录，不进 surface |
| `tool/result` | **surface 事件**（含 message，供模型看结果） |
| `todo/write` | 待办写入 |
| `request/header` / `request/context` | epoch 快照（被 fold 成 header/context，不投影消息） |
| `session/end-seed` | seed 结束标记 |

**store 生命周期**：`session/created` / `session/disposed`（emit，逐 listener contained）/ `session/flush`（**parallel**，持久化屏障）。

## 核心机制（源码证据）

1. **append 两阶段验证 + 发布**（`index.ts:604`）：① `snapshotJsonValue(data)` 一次遍历同时完成 lossless-JSON 验证与脱拷贝（stateful getter 无法验证一份存另一份）；② `assertSupportedRequestHeader`；③ `surfaceManager.validateNext(event)` 在**提交前**验证 surface 契约；④ 标 `entry.appending` 防重入 → `log.push` → 失效 events 快照 → `session/event` 逐 listener contained 发布。**事件本身 `deepFreeze`**，返回快照而非调用者可变输入。
2. **surface 契约**（`surface.ts`）：只有 `user/message`、`assistant/message`、`tool/result` 三类型**必须**带 `surfaceOp` 标记，非 surface 类型带标记直接编译+运行时报错。`sourceEventSeqs` 只在 surface 事件上合法，且**必须覆盖被 replace shadow 的全部节点**（`assertProvenance`）；`tool/result` 的 replace **只能改 content**（`assertToolResultRewrite`，其余字段深比较必须一致）——这是工具结果修复的唯一合法通道。
3. **SurfaceManager 增量 fold**（`surface.ts:398`）：`validateNext` 把候选 plan 存 `_pendingPlan`，等 `log.push` 后 `_processDelta` 应用——**先验证后提交**两阶段，log 是唯一真相源。`replace` 提升 `replaceGeneration`，驱动 `deriveMessages` 缓存失效重建。
4. **deriveMessages 缓存**（`index.ts:726`）：每 surface 节点只投影一次（O(new nodes)），返回**新鲜数组 + 共享深冻结 Message**（复用事件内已冻结数据，不二次深拷）。空 content assistant/message 投影为 null 不进 transcript。
5. **header/context 增量 fold**（`index.ts:670`）：`requestHeader()`/`requestContext()` 每事件只 fold 一次，返回 deepFreeze 结果；`canonicalHeader` 规范化（空 system/tools 省略），`headerEquals` 供 loop 避免记录未变化 header（`request-header.ts`）。
6. **store 生命周期三分**（与 agent 包同构）：`create` = `prepare` + `enter` + `announce` **折叠进单个 effect**（`index.ts:836`）——detach 先 yield 再 announce，`session/created` listener 抛错时 generator effect 自动 dispose 已 yield 的 disposer（rollback 不泄漏）；`enter` 装发布钩子 + 入库返回 detach（重复 id 权威碰撞边界在 enter，不信任 prepare 与 enter 之间的任意间隔）；`announce` 标 `announced` 在前，同步 listener 失败 veto 发布，async rejection 只 log；detach 在 announcing/appending 发布期间 latch（`detachRequested`）等 unwind 再执行配对 disposed。
7. **flush 是唯一入口**（`index.ts:1022`）：store 持有 carrier，`ctx.parallel('session/flush', …)` 不能 raw dispatch——one owner one spelling。`Promise.allSettled` 全 settle 后抛第一个 failure，返回是否有人参与（持久化插件可据此知道无人落盘）。
8. **fork**（`index.ts:1081`）：稳定前缀拷贝。boundary 必须连续存在、不能落在 open turn 内（`OPEN_TURN`）；child meta 记录 `parentSession`/`seedLength`/`cwd`。
9. **lossless-JSON 边界**（`json.ts`）：迭代式 walk 防栈溢出（深嵌套内存受限而非栈受限），拒绝 sparse/cyclic/exotic/-0/NaN，数组只认原生 prototype、拒绝额外 own keys（JSON 会丢）。
10. **支持模块**：`chunk-rows.ts` 把 assistant/chunk 运行打包成 `StorageRecord` 压缩存储；`repair.ts` 的 `interruptedTurnClosers` 为打断的 turn 补 close（TOOL_NOT_STARTED / TOOL_OUTCOME_UNKNOWN 工具状态）；`invariant.ts` 是 `session-invariant` 收尾校验插件；`preparation.ts` 提供 `SessionPreparation` Disposable。
11. **typert 集成**：`lookups.register('session', {parameter:'session', wire:'sessionId', hostTypeSymbol:'@deepseek-ai/dsh-session#Session', …})`。

## 与全景文档的咬合

- 对应 L3「事件溯源」的运行时实现：append-only + `seq=log.length` 连续 + 深冻结 + surface 派生模型历史
- `session/flush` 是 L3「持久化边界」的唯一挂钩点；`SessionStore` 注释明说 persistence plugins 订阅 `session/event` 落盘
- 1-3-2「事件分发 5 模式」印证：`session/event` emit 逐 listener contained、`session/flush` parallel
- 与 agent-loop 的 creation transaction 咬合：loop 的 `prepare+enter+announce` 把 session + agent 生命周期折进**同一个** factory effect，保证 fiber unload 时按序拆除（loop 收尾事件先于 store 钩子移除发布）
- `SurfaceOp.replace` 是 1-3「compaction/修复」的机制底座：shadowed 节点从模型历史消失但 append-only 日志里完整保留（模型历史 ≠ 人看 transcript；`isAppendSurfaceEvent` 才是 transcript 素材）

## 待 1-4-3 用测试印证

- `tests/` 13 个文件：重点 `session.spec.ts`（append 验证链 + 重入拒绝）、`surface.spec.ts`（replace 规则全分支）、`fork.spec.ts`（OPEN_TURN / INVALID_BOUNDARY）、`derived-cache.spec.ts`（replace 后缓存重建）、`repair.spec.ts`（interruptedTurnClosers）
- 契约 demo 候选：**session 事件追加/回放**——append 一串事件（含一个 replace + tool/result rewrite），验证 `deriveMessages()` 结果、`foldSurface` 重放一致性、restore 后 seq 连续性
