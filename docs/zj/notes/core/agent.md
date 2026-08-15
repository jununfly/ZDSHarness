# 1-4-1 精读笔记：`@deepseek-ai/dsh-agent`

> 包路径 `packages/core/agent/` ｜ 源码 `src/`（8 文件）｜ 测试 `tests/`（6 文件）
> 精读日期：2026-08-15 ｜ 定位：**产品 API 的接口主轴**——零循环依赖，loop 可替换

## 一句话定位

Agent 接口、活体注册表、进程内 initiator 因果链，以及 `agent/*` 事件词汇。**具体创建与驱动不属于本包**——由实现 `AgentFactory` 的插件（`dsh-agent-loop`）提供。所有 UI / hooks / 编排器都只面向这里定义的 `Agent` 句柄编程。

## 公开面

- **Service**：`ctx.agents`（`AgentRegistry extends Service`）
- **DX accessor**：`ctx.agent` —— 默认 `undefined`，每个 `Agent.ctx` 上用 own property 遮蔽为对应 agent（own property 先于 context proxy 解析，所以 accessor 本体永远不用自己解析 scope）
- **类型**：`Agent`（活体句柄）、`AgentHandle`（agent + dispose）、`AgentOptions`（provider/model/maxTokens）、`CreateAgentOptions` / `ResumeAgentOptions`、`AgentStatus`（`'idle' | 'running'`）
- **工厂契约**：`AgentFactory { createAgent(ownerCtx, options); resume(ownerCtx, options) }`
- **事件**（全部 `Scoped<Agent>` this + payload 携带 agent，scope 过滤）：见下表

## Agent 接口（`src/runtime-types.ts`）

| 成员 | 语义 |
|---|---|
| `id` / `options` / `session` / `inbox` / `status` / `ctx` | 单一身份（与 session 共享）+ 模型路由 + 活会话 + 持久待办投影 + 生命周期状态 + agent 私有作用域上下文 |
| `cancel(cause, {keepInbox?})` | 清队/放弃活跃 turn；首个 cause 胜出；无活跃活动时 no-op |
| `whenIdle()` | 等整个 agent 活动到达静默 |
| `runMaintenance(task)` | 从 true-idle 阶段跑一个非 turn 维护任务（信号由 cancel 中止） |
| `send(message, target, wakeup)` | 投递到 inbox 边界（next-turn / next-step）并可唤醒 driver |
| `followup(message)` | 排一个普通后续 turn 并唤醒 |
| `steer(message)` | 提交到最近 step 的 steering（运行中 driver 在下个 step 边界消费） |
| `inject(message)` | 给下个 pre-step 塞模型上下文，不唤醒 |

## 事件词汇（`agent/*`，scope-filtered dispatch）

| 事件 | 模式 | 作用 |
|---|---|---|
| `agent/created` / `agent/disposed` | emit | 发布/离开注册表 |
| `agent/status` | emit | idle ⇄ running 迁移 |
| `agent/inbox/inserted` / `claimed` / `discarded` | emit | 消息进出 inbox 的可观测点 |
| `agent/session-start` | emit | session 生命周期开始（startup/resume/clear/compact） |
| `agent/pre-step` | **waterfall** | 否决或替换进入 step 的消息；`next()` 保留现状 |
| `agent/request` | **waterfall** | 替换冻结的调用配置（不能改消息，模型可见内容必须走日志通道） |
| `agent/request-error` | **waterfall** | 失败恢复：返回 `{kind:'retry'}` 拥有恢复，`next()` 委托 |
| `agent/turn-stopping` | **serial** | turn 关闭前的最后拦截；监听器可 `steer()` 续命 |
| `agent/error` | emit | step/turn 错误通知 |

**关键语义**：turn 是否关闭由**数据**决定（`concludesTurn` 工具结果、fresh steering），不是监听器顺序——"数据说了算，顺序改不了结果"。

## 核心机制（源码证据）

1. **工厂委托 + 调用者追溯**（`index.ts:405`）：`create()` 先 `requireFactory()`，再用 `getTraceable(ownerCtx, target)` 得到 caller-traced receiver，`Reflect.apply(target.createAgent, receiver, [ownerCtx, options])`。ownership 跟随**调用者**而非工厂注册上下文。
2. **注册原语三分**：
   - `register(agent)` —— 已构造 agent 的普通注册（effect 包 enter + announce，返回**精确** disposer 身份，供复合 effect 按序嵌套）
   - `enter(agent, owner)` —— 未发布插入 + 返回 detach 闭包（async factory 用它先完成 setup 再 announce）
   - `announce(agent)` —— 发布边界：先标 `announcing`，同步 listener 失败 veto 发布，finally 里处理 detachRequested
3. **Initiator 因果链**（AsyncLocalStorage 实现，仅进程内归属，不是活体证明/授权）：`withInitiator(agent, op)` / `withoutInitiator(op)` / `currentInitiator()` / `requireInitiator()`。drain 语义：teardown 时等返回的 Promise 边界 settle，嵌套的 reentrant 链排除在自身 drain 外。
4. **typert 集成**：`typert.lookups.register('agent', {parameter:'agent', wire:'agentId', ...})` + `contexts.registerHost('agent')` —— agent 是 type system 的一等公民（wire 为 `agentId: SessionId`）。
5. **融合分发器 `agentEvents`**（`dispatch.ts`）：把 agent subject 与 scope carrier 耦合——payload 里的 `agent` 由 dispatcher 注入，subject 与 scope key 不可能分离；emit 的监听器异常按个 contained（一个 listener 抛错不饿死后继 observer）。

## 与全景文档的咬合

- 对应 L2「core 分组」中 agent 的定位；L3「插件形态与注册原语」中 `ctx.on`/effect 的实际应用（register 是 effect 包 enter+announce）
- `agent/*` 事件词汇是 L3「Turn-Step 事件流」的运行时界面（pre-step/request/turn-stopping 是 loop 的三个 waterfall 扩展点）
- 1-3-2 的「事件分发 5 模式」在这里得到印证：`agent/created` 用 emit、`turn-stopping` 用 serial、三个扩展点用 waterfall

## 待 1-4-3 用测试印证

- `tests/` 6 个文件：agent 的 enter/announce 回滚覆盖（listener 抛错 → 不发布 + 配对 disposed）
- initiator drain 的边界行为（嵌套链排除自身 drain）
