# 1-4-1 精读笔记：`@deepseek-ai/dsh-system-prompt`

> 包路径 `packages/core/system-prompt/` ｜ 源码 `src/`（2 文件，605 行）｜ 测试 `tests/`（4 文件）
> 精读日期：2026-08-15 ｜ 定位：**每次模型 step 前的 prompt 输入装配**——有序 section + 动态 context + tool schema + 变量

## 一句话定位

`ctx.systemPrompt` 是 prompt 输入的**注册中心与装配器**：有序 section（`harness:identity` -100 → `deployment:persona` 0 → 工具指引 100–199）、动态 runtime context（user-role 快照）、tool schemas（provider 贡献 + toolOrder 排序）、`{{variable}}` 变量插值。装配产出 `PromptAssembly`，经 `system-prompt/assemble` waterfall 可被权威改写，最后 `renderPrompt` 插值成模型可见文本。**代码模式下的 SDK section 也由 tools 包挂在这里**（`tools:sdk` order 150）。

## 公开面

- **Service**：`ctx.systemPrompt`（`SystemPrompt extends Service`）
- **注册**：`section({name, order, text, complete?})` / `context({name, order, text})` / `suppressRuntimeContext()` / `tools(provider)` / `variable(name, provider)` —— 全部返回精确 effect disposer，scoped 注册遮蔽全局同名
- **装配**：`assemble(context?)`（async，返回权威 assembly）
- **纯函数**：`renderPrompt(assembly)` / `renderContextSnapshot(assembly)` / `renderContextSections(assembly)` / `joinContextSections(sections)`
- **常量**：`PERSONA_SECTION` / `PERSONA_ORDER = 0` / `TOOL_ORDER_REST = '<unlisted-tools>'`
- **类型**：`PromptSection` / `PromptContext` / `PromptAssembly`（sections/contexts/tools/variables）/ `AssembleContext` / `ToolProviderResult`

## 事件词汇

| 事件 | 模式 | 作用 |
|---|---|---|
| `system-prompt/assemble` | **waterfall** | 对已装配的 sections/contexts/tools/variables 做权威改写；complete section 在 waterfall **之后**恢复为唯一 section（listener 不能增删它） |
| `system-prompt/change` | emit | 注册表变化通知；**不 scope-filtered**（全局变化关切每个 scope） |

## 核心机制（源码证据）

1. **层合并 + 遮蔽**（`index.ts:484`）：`layers.merge(scope, layer => layer.sections)` 沿 scope chain 合并，scoped 遮蔽全局同名；variables 先写 global 再 scope chain **farthest first**（nearest 最后写 → 胜出）。这正是 agent 包 preset 遮蔽 deployment persona 的机制（两侧都命名 `deployment:persona` 才实现替换而非重复）。
2. **toolOrder 契约**（`index.ts:146`）：配置时校验——`TOOL_ORDER_REST` 必须恰好出现一次、无重复；装配时校验——unknown 名称失败（对照 **pre-restriction** knownNames，被 restrict 掉的已知名可以缺席）、reserved 名来自 provider 则失败；unlisted 工具在 rest 位按**字典序**插入（`compareToolNames` code-unit 比较，跨机器一致）。省略 toolOrder = 纯字典序。
3. **complete section**（`index.ts:505`）：多于一个有效 complete 装配失败；装配仍跑 waterfall（tools/contexts/variables 可解析），结束后**恢复该 section 为唯一 prompt section**——complete 是"这是全部"的声明，不是"请替换"的钩子。
4. **严格变量插值**（`index.ts:258`）：`{{name}}` 名字必须匹配 `[a-z][a-z0-9_]*`；畸形引用（`{{` 后无完整组但后面有 `}}`）、未注册名（`Object.hasOwn` 防原型链）、undefined 值全部抛错；**孤立 `{{` 无配对 `}}` 是字面散文**；替换值不再二次扫描。空 section/context 渲染时 drop，非空按 `\n\n` 连接。
5. **runtime context 快照**（`index.ts:236`）：`renderContextSections` 保留具名贡献（UI 可归属），`joinContextSections` 加固定前缀 "Current runtime context. This snapshot supersedes earlier runtime-context snapshots."——**新快照取代旧快照**的语义由这行字面承诺。`suppressRuntimeContext()` 全局或 scoped 均可，装配层直接输出空 contexts（不依赖服务自查）。
6. **tool schema 贡献**（`index.ts:493`）：global + scope chain 全部 provider 都贡献（tools 与 sections 不同，不遮蔽、相加）；参数 `structuredClone` 脱拷贝；`knownNames ?? schemas` 供 toolOrder 验证。

## 与全景文档的咬合

- 对应 L3「System Prompt 装配」：有序 section 带（-100 identity / 0 persona / 100-199 工具指引）约定正是 prompt 组装规则
- `system-prompt/assemble` waterfall 是 1-3-2「事件分发 5 模式」中 waterfall 的又一大应用点；权威返回值语义（waterfall 结果即最终值）
- 与 tools 包咬合：tools 包构造时 `ctx.systemPrompt.tools(...)` 挂 schema provider、`section(tools:sdk)` 挂 SDK prompt（`SDK_SECTION_ORDER=150` 落进 100-199 工具指引带）；code-only 声明（`COLLAPSE_SECTION_ORDER=99`）故意排在工具指引**之前**——模型先读到"只能调 run_code"再读每个工具是什么
- 与 agent-loop 咬合：loop 每次 step 前 `assemble()` → runtime-context 投影 → `renderPrompt` → 请求构造（runtime-context.ts 里 agent-loop 把 session 事件投影为 context 贡献）

## 待 1-4-3 用测试印证

- `tests/` 4 个文件：`system-prompt.spec.ts`（582 行，装配/遮蔽/complete/插值）、`tool-order.spec.ts`（rest 契约）、`scoped.spec.ts`、`invariant.spec.ts`
- 验证点：complete section 经 waterfall 后恢复、`{{` 字面散文边界、toolOrder unknown 装配时失败
