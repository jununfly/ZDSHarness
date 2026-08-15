# 1-4-1 精读笔记：`@deepseek-ai/dsh-agent-loop`

> 包路径 `packages/core/agent-loop/` ｜ 源码 `src/`（6 文件，1643 行）｜ 测试 `tests/`（20 文件，全仓库最多）
> 精读日期：2026-08-15 ｜ 定位：**THE 具体 agent 插件与 loop 驱动**——全仓库唯一含具体 loop 逻辑的包，其余全是抽象服务或扩展点插件

## 一句话定位

实现 `AgentFactory`（`createAgent`/`resume`），构造 `ReactLoopAgent`（turn/step 状态机驱动），通过 agent/session 注册表发布，并拥有**有序逆序拆除**。

## 公开面

- **Service**：`ctx.agentLoop`（`AgentLoop extends Service implements AgentFactory`）
- **注入**：`static inject = ['agents', 'sessions', 'llm', 'tools', 'systemPrompt']`——依赖由 Cordis 解析
- **Config**：`maxParallelToolCalls`（每 step 并行工具上限，默认 `DEFAULT_MAX_PARALLEL_TOOL_CALLS`，1=串行）+ `agents[]`（声明式启动：id/sessionId/cwd/provider/model/maxTokens/resumeSessionId）
- **Settings**：`agent-loop` namespace，`maxParallelToolCalls` 运行时热改（`source()` 惰性读取，`setSource` 切换）
- **事件**：`agent-loop/config-start-failed`（声明式 agent 启动失败通知，emit）
- **常量**：`CONFIGURED_AGENT_IDENTITIES_KEY`（launcher 在 Loader 挂载前用 `ctx.provide()` 固定配置 agent 的 session 身份）

## 核心机制（源码证据）

### 1. 工厂所有权模型（`index.ts` FactoryOwnership）

- `track(dispose)`：登记每个活 agent 的共享 teardown；`trackStartup`/`trackWrapper` 加入 config 启动与 create/resume 延续
- `dispose()`：`accepting=false` → abort（reason: `agent loop is not active`）→ `Promise.all(全部 liveAgents teardown + startupTasks)`
- `waitWhileActive`：`Promise.race([job, inactive.promise])`——factory 拆除时不再等待

### 2. prepare：三路 abort 融合 + memoized 逆序拆除（`index.ts:459`）

- **三路 abort**：caller `AbortSignal` / owner fiber unload（`ownerCtx.effect`）/ factory teardown——任一触发都 abort 共享 controller
- **注册顺序先于资源存在**：unload 在 scope 铸造中到达也有可用 disposer
- **逆序 teardown**（`disposing ??=` memoized）：`machine.cancel({kind:'disposed'})` → `whenIdle()` → `scope.dispose()` → `detachAgent()` → `detachSession()` → untrack。disposal 本身就是"disposed-cause cancel + quiescence"
- **publish(source)**：`sessions.enter` → `agents.enter` → `sessions.announce` → `agents.announce` → emit `agent/session-start` → 返回 `{agent, dispose}`；**每个边界后 `assertLive()`**（abort 后立即抛）

### 3. setup 事务（未发布 setup，`setupAndPublish`）

- `raceAbort(setup?.(agent.ctx), signal, id)`：setup 在发布前完成，可返回同步 `commit()`（publish 前调用，供可变供应在发布边界重校验）
- 失败 → `prepared.dispose()` 回滚，**不发布任何 id**

### 4. ReactLoopAgent：Phase 状态机（`agent.ts`）

```
Phase = idle{lastTurn}
      | maintenance{abort, lastTurn, wakeRequested}
      | running{abort, turn, step, wakeRequested}
```

- `status`：idle/maintenance → `'idle'`；running → `'running'`；`setPhase` 在状态翻转时 emit `agent/status`
- **wakeDriver**：idle → running（新 AbortController）+ `agents.withInitiator(this, () => this.kick())`；maintenance/aborted 期间 latch `wakeRequested` 等收敛重放；disposed 不 latch（teardown 不等模型 turn）
- **kick**：`while (await this.turn()) {}`，finally 回 idle（wakeRequested && hasPending → 再 wakeDriver）

### 5. turn()：turn 边界（`agent.ts:246`）

```
turn/start 事件 → 循环:
  preStep(target, {turn,step}):  // claim inbox + systemPrompt.assemble + runtimeContext.project
    → 'agent/pre-step' waterfall（默认 enter；可 reject 或改消息）
    reject → turn/end{blocked} → return false
  step/start 事件 → user/message 追加 → step(assembly) → step/end
  turnEnds && nextStep 空 → 'agent/turn-stopping' serial（可 steer() 续命）
  turnEnds && nextStep 空 → break
finally: 永远 append turn/end（reason: turnEnds!）
hasPending → 新 AbortController + step=0 → return true（开下一 turn）
```

- max-tokens **sticky**：任何 step 触顶后，后续正常完成的 step 不得降级 turn 结局
- `turnEnds` 结构：`completed | max-tokens | blocked | aborted{reason} | error{...}`

### 6. step()：模型请求循环（`agent.ts:332`）

```
buildRequest → llm.stream → for await chunk: assistant/chunk 事件 + assembler.push
finish error/aborted → 'agent/request-error' waterfall（{kind:'retry'} 续循环，否则 throw LlmError）
assistant/message 追加（sourceEventSeqs: chunkSeqs）
max-tokens → return {kind:'max-tokens'}
tool-calls 过滤 → executeToolCalls → concluded ? completed : null（null → 下一轮模型调用）
```

### 7. buildRequest：请求装配（`agent.ts:407`）

- seedConfig：首次 = route+reasoningEffort+maxTokens；后续 = `requestProposal(persistedHeader)`（**去 adapter 派生值**，如 reasoningEffort/maxTokens 是 adapter 默认填充的）
- `'agent/request'` waterfall → proposedConfig；缺 provider/model 抛错
- `llm.prepareCall` 解析 adapter；`NO_ADAPTER` 错误降级用 proposedConfig（middleware 可服务未注册路由）
- `request/header` 事件（initial/resume/change）→ session 持久化；`request/context` 记录 provider/model/contextWindow
- `markAgentLoopRequest` + `deepFreeze`

### 8. executeToolCalls：工具调度（`tool-calls.ts`）

- 计划全部 call（model order）；按 `ctx.tools.executionMode(exec).kind` 分组：exclusive → 单 call barrier；parallel → 滚动池（`inFlight.size < maxParallelToolCalls`，start 前重分类）
- **结果按 model order 提交**：`commitReady` 只在连续槽位就绪时推进（乱序完成也保持模型序）
- `prepare` 三态：`dispatch`（异步跑）/ `post-result`（需 finalize）/ `final-result`（直接 finish）
- **abort**：停止补货 → drain 已开始 → 对未开始 call 记 synthetic 错误（code `TOOL_ABORTED_BEFORE_DISPATCH`）→ 保持 signal aborted
- **scheduler failure**：停止新 dispatch、drain 已开始的、**不伪造结果**（保留已记录 tool/call）
- 会话事件：`tool/call`（seq 被 result 引用）+ `tool/result`（sourceEventSeqs: [callSeq]，meta 持久化供 UI 桥回放）
- `concludesTurn` 传播 → turn 结束

### 9. runtime-context.ts：动态上下文投影

- 从 session 事件恢复 last retained snapshot（只认 system-prompt 插件来源的 user/message）
- `session/event` 监听：新 snapshot 更新；replacement surface 事件清空
- `project(current, sections)`：仅变化时生成候选 user message；空 → `CLEARED` 标记

## 与全景文档的咬合

- **图 9（fiber 状态机）就是 agent-loop 的 turn/step 状态机**——之前 1-3 画的抽象，这里是实现
- `agent/*` 事件词汇的三个 waterfall 扩展点（pre-step/request/request-error）全部在此驱动；`turn-stopping` serial 在此调用
- inject 声明（`static inject`）→ Cordis 拓扑排序 → 依赖服务就绪后才构造
- 工具管线（tools/pre-execute → execute → post-execute）由 `ctx.tools[TOOL_RUNTIME_SCHEDULER]` 呈现

## 待 1-4-3 用测试印证

- `loop.spec.ts`：turn 生命周期（turn/start → step/start → user/message → ... → turn/end）
- `tool-calls.spec.ts`：exclusive barrier / parallel 池 / abort 合成结果
- `cancel.spec.ts` / `interception.spec.ts`：cancel 收敛与 pre-step 否决
