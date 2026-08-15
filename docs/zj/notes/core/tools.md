# 1-4-1 精读笔记：`@deepseek-ai/dsh-tools`

> 包路径 `packages/core/tools/` ｜ 源码 `src/`（10 文件，5620 行）｜ 测试 `tests/`（12 文件）
> 精读日期：2026-08-15 ｜ 定位：**工具注册表 + 五阶段执行管线 + 模型呈现（native/code/both）**

## 一句话定位

工具注册表（`ctx.tools`）与工具执行的完整生命周期：**注册 → scope 可见性解析 → pre-execute 策略 → 守卫 → around-dispatch → 工具体 → post-execute 策略 → 内容定稿 → 通知**。同时承担模型呈现：native（全量 schema）/ code（只给 `run_code` + 生成 SDK prompt）/ both。`code-mode.ts` 的 `run_code` 是保留的呈现 transport，其 SDK 子调度复用本 registry 的 staged 执行接口。

## 公开面

- **Service**：`ctx.tools`（`ToolRuntime extends Service`，inject `systemPrompt`）
- **注册**：`register(definition)`（全局或 scoped）、`restrict(filter)`（仅 scoped）、`guard(guard)`（单调守卫）、`presentAs(mode)`（仅 scoped）
- **查询**：`get(name, scope?)`、`schemas(scope?)`（模型可见白名单字段）
- **执行**：`execute(exec: ToolExecutionInput)` —— 单入口；内部经 `[TOOL_RUNTIME_SCHEDULER]` staged 接口（prepare/dispatch/finalize/finish）供 agent-loop 并行调度器消费
- **类型**：`ToolDefinition`（schema + output + execute + 可选 finalizeContent/timeoutMs/isConcurrencySafe/presentCall/presentResult）、`ToolExecutionResult`（success/failure 判别联合）、`PreToolDecision`/`PostToolDecision`、`ToolExecutionToken`（opaque symbol）、`ToolPresentationMode`
- **子模块**：`schema.ts`（defineTool + InferArgs 类型推导）、`json-schema.ts`（assertSupportedJsonSchema/validateJsonSchemaValue）、`presentation.ts`（UI 渲染意图词汇）、`ts-types.ts`/`py-types.ts`（SDK 渲染器）、`code-mode.ts`（run_code transport）

## 事件词汇（`tools/*`，scope-filtered 除 tools/change）

| 事件 | 模式 | 作用 |
|---|---|---|
| `tools/pre-execute` | **waterfall** | allow/deny/ask 前置门；`ask` 走 approval 服务，无 approval 时降级 deny |
| `tools/execute` | **waterfall** | around-dispatch：timeout/retry/metrics 包装；只能换 `exec.signal`，call identity 不可变 |
| `tools/post-execute` | **waterfall** | accept（替换 content 或 value）/block（矫正反馈转 isError）；可挂 additionalContexts |
| `tools/code-dispatch-log` | **waterfall** | run_code 子调度落库内容替换（spill 策略）；监听器异常 contained，回退原始内容 |
| `tools/result` | emit | 冻结最终结果的只读观察；逐 listener contained |
| `tools/change` | emit | **故意不 scope-filtered**——全局注册表变化关切每个 agent 的下次装配 |

## 核心机制（源码证据）

1. **执行管线五阶段**（`index.ts:1342`）：`execute` = `prepare`（materialize args → 快照深冻结 → pre-execute waterfall → approval ask → guard → 再查 caller cancel）→ `dispatch`（execute waterfall + 工具体，fuse 信号）→ `finalize`（post-execute → finish）→ `finish`（materialize → finalizeContent → materialize → notifyResult）。`canonicalResults` WeakMap 区分 registry-normalized 结果与 wrapper-authored 结果——wrapper 自造的成功结果经 `normalizeDispatchResult` 重新走 `createSuccessResult`（schema 验证 + render + presentationMeta），**绕过输出契约的 wrapper 结果会被拉回规范**。
2. **取消语义**（`index.ts:1518`）：`cancellationStates` 记 `bodyInvoked`；abort 时 body 未启动 → `ABORTED_BEFORE_DISPATCH`，已启动 → `ABORTED`。**从不 abandon body promise**——启动的工作必须到达 quiescence 才落地结果。`fuseToolSignals` 手工 fuse（不用 AbortSignal.any），relay 是 dispatch-scoped 的，settle 后 remove listener。
3. **code collapse**（`index.ts:1324`）：`collapses() = !nested && modeFor(scope)==='code' && name !== RUN_CODE_NAME`。model-direct 调用只能命名 `run_code`，SDK 子调度（`parent` token 集）可调任何可见工具。collapse 在**策略管线之前**确定性拒绝（pre-execute/approval/guards 看不到也批准不了），拒绝以 `UNKNOWN_TOOL` + `reachableFrom` 提示呈现（`ToolNotFoundError`）。`resolveExecution` 与 `createExecution` 共享同一谓词，杜绝"提示一套、执行一套"的 bypass。
4. **可见性解析 `view(scope)`**（`index.ts:1152`）：scope chain layers → inherited（nearer 覆盖 farther）→ **restrictions 只过滤继承面，不碰 own registrations**（child 的 reporting/structured-output 工具在 own layer，不能被能力过滤剥掉）→ code transport 最后追加（`modeFor(scope) !== 'native'` 时），在可过滤层之外、注册时保留名不可注册/不可 shadow。
5. **守卫单调性**（`index.ts:1110`）：`guard` 只能返回 denial reason，没有 allow 结果——**监听器顺序无法把已拒绝的调用翻回允许**；guardReason 先 global 层再 scope chain（farthest first）。
6. **deferContext / concludeTurn**（`index.ts:1391`）：工具体内 `deferContext` 把上下文挂到本执行结果 `additionalContexts`（复合工具摆渡嵌套调度上下文）；`concludeTurn()` 把执行标入 `concludingExecutions` WeakSet，成功结果带 `concludesTurn: true`——**loop 提交该批结果后停 turn**。block 时丢弃 body defer 的上下文，只保留 block 决策显式给的。
7. **code-mode bridge**（`code-mode.ts:294`）：`createRunCodeTool` 用 `requireRuntime`/`peekRuntime`/`maxParallel`/`shapeDispatchLog` 四个 registry-private 闭包能力（requireRuntime 惯用法——公开 API 不暴露私有调度入口）。run 内子调度复用 registry staged 接口，按原生 loop 同款并发规则（exclusive barrier / parallel pool 到 maxParallelSubCalls，默认 10），ordered 阶段在**单一 driver lane** 内串行，只有 around-dispatch/body 并发；结果按提交顺序经 head-of-line cursor commit。子调度事件 `tool/code-dispatch-start` / `tool/code-dispatch` 扩展 session 事件词汇（`types.ts`），log-only、不进 deriveMessages——**子调用永远不再进入模型上下文**。
8. **模型 schema 白名单**（`index.ts:1256`）：`schemas()` 只投影 name/description/parameters（参数也 lossless 快照）；`timeoutMs`/`isConcurrencySafe`/`output` 等**永不发给模型**。
9. **呈现模式**：`modeFor(scope)` 沿 scope chain 取最近声明（preset 的 standing 声明覆盖旗下所有 agent），否则 deployment default。`presentAs` 仅 scoped（全局覆盖就是 config.mode 字段），每 scope 一个声明（两个答案矛盾不是合并）。SDK section 从**调用 scope** 重新生成（`sdkSection`），native agent 下渲染为空被 drop。

## 与全景文档的咬合

- 对应 L3「工具注册表与执行管线」：register/restrict/guard 三分 + pre/guard/around/post/result 五段是 1-3-2「事件分发 5 模式」中 waterfall 的三大应用点（pre-execute/execute/post-execute）
- code 模式 = L3「Code Mode 呈现」：collapse 谓词 + SDK 生成 + `tool/code-dispatch*` 事件词汇（与 session 包模块扩展咬合）
- 与 agent-loop 的 parallel scheduler 咬合：`TOOL_RUNTIME_SCHEDULER` staged 接口是 loop `executeToolCalls` 的消费面（exclusive barrier / bounded parallel rolling pool / model-order 提交都在 loop 侧，tool 侧提供 `executionMode()` 分类与 staged 阶段）
- 与 session 包咬合：`tool/result` 事件（surface）携带 render 投影 + `meta`（presentationMeta 投影，仅 top-level 调用）；deferContext 的 additionalContexts 由 loop 在 `tool/result` 之后 append
- `concludesTurn` 是 L3「turn 关闭数据决定」的机制底座：tool 声明、loop 读数据、监听器顺序改不了结果

## 待 1-4-3 用测试印证

- `tests/` 12 个文件：重点 `tools.spec.ts`（2785 行，管线全分支）、`code-mode.spec.ts`（1797 行，bridge 调度）、`scoped.spec.ts`（scope 可见性/restriction 交集）、`execution-mode.spec.ts`（并发分类 fail-closed）
- 契约 demo 候选：**tools 执行管线**——注册一个工具 + pre-execute deny + guard deny + around wrapper，验证五阶段顺序、cancel 的 ABORTED/ABORTED_BEFORE_DISPATCH 二分、wrapper 结果被拉回规范
