# 1-4-1 略读笔记：`agent-default-model` + `agent-tool-presentation`

> 包路径 `packages/core/agent-default-model/`（2 文件，137 行）+ `packages/core/agent-tool-presentation/`（2 文件，104 行）
> 精读日期：2026-08-15 ｜ 定位：**agent 平面（preset 可拥有）的两个组合行**——默认模型选择 + 工具呈现声明

## `@deepseek-ai/dsh-agent-default-model`

- **一句话定位**：无 session 特定选择时 agent 的默认模型选择（`ctx.agentDefaultModel`）。composition entry 持有 provider/model（必填），**settings provider 挂载后其 user layer 被 live 读取**——source 由 `installSettingsSection` 的 `setSource` 替换。
- **公开面**：`currentSelection(): ModelSelection`（读 live source，投影出 provider/model/可选 reasoningEffort）/ `saveSelection(next)`（写 settings namespace `agent-default-model`，无 settings provider 时保持 composition entry）。
- **要点**：`onChange: () => {}`——所有消费者都走 `currentSelection()` 读，settings 文档变化不需要重建任何注册级事实。这是「读时解析」而非「注册时烘焙」的模型。

## `@deepseek-ai/dsh-agent-tool-presentation`

- **一句话定位**：preset 携带的一行，声明其覆盖的 agents **模型看到哪种工具形式**。tools 注册表本身留在 host 平面（loop 调度器/API proxy 呈现器/工具插件都是它的消费者，无法移进 preset），但 **presentation 声明归 preset**——`ctx.tools.presentAs()` 声明在 mounting SCOPE（preset 的 standing mount），覆盖旗下每个 agent，一个 code 预设与 native 预设可在同一进程并存。一行 per 组合，不是 per session。
- **机制**（`index.ts:59`）：`apply` 里 `native` 直接 `presentAs('native')`；非 native 用 `ctx.inject(['codeRuntime'], ...)` **等待** code runtime——code mode 需要 host-plane 的 TypeScript runtime，不组合 runtime 时 **mount 即失败**（preset activation audit 点名这一行），而不是等到第一个 prompt。
- **为什么必填而非默认**：deployment default 是没写这一行的 preset 本来就会拿到的，省略 = 组合了个寂寞。

## 与主轴笔记的咬合

- `agent-tool-presentation` 的 `presentAs` 回调到 tools 笔记的「呈现模式」：`modeFor(scope)` 沿 scope chain 取最近声明——正是这条 preset 行的落点
- `agent-default-model` 的 `ModelSelection` 是 agent 包 `AgentOptions` 的 provider/model 路由字段的来源
- 两包共同体现 host/agent 平面分离：**服务性能力留 host，声明性选择归 agent 平面**
