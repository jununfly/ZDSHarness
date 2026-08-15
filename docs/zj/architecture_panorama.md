# ZHarness 架构全景（C4 视角）

> **数据源文件**：本 md 是唯一数据源，HTML 由 `gen_panorama_html.py` 从本文件生成，禁止手改 HTML。
> **同步策略**：随学习路线图（`learning_roadmap.json`）进度逐层展开。每节标注解锁节点与状态。
> 最后更新：2026-08-15（解锁至 1-2-3）

## 进度索引

| C4 层 | 章节 | 解锁节点 | 状态 |
|---|---|---|---|
| L1 | [系统上下文](#l1-系统上下文) | 1-2-1 | ✅ 已展开 |
| L2 | [容器](#l2-容器) | 1-2-2 | ✅ 已展开（实测校准） |
| L3 | [组件：核心包](#l3-组件核心包) | 1-2-1 | ✅ 已展开 |
| L3 | [组件：能力缝 seam](#l3-组件能力缝-seam) | 1-4-2 | 🔒 待展开（已有骨架） |
| L3 | [组件：Turn/Step 事件流](#l3-组件turnstep-事件流) | 1-2-1 | ✅ 已展开 |
| L3 | [组件：Profile/Bundle 组合](#l3-组件profilebundle-组合) | 1-2-1 | ✅ 已展开 |
| L3 | [组件：插件形态与注册原语](#l3-组件插件形态与注册原语) | 1-2-3 | ✅ 已展开（demo 实证） |
| L4 | [代码：关键接口](#l4-代码关键接口) | 1-3 / 1-4 | 🔒 待展开 |

---

## L1 系统上下文

ZHarness（`dsh`）是一个插件式 agent harness：一切皆插件，包括模型适配器、工具注册表、会话日志和 agent loop 本身。

```mermaid
flowchart TB
    human["👨‍💻 Human<br/>开发者 / 使用者"]

    subgraph zh["dsh — ZHarness agent harness"]
        direction TB
        cli["CLI 终端交互"]
        webui["Web UI 浏览器交互"]
        acpc["ACP 自动化客户端"]
    end

    llm["☁️ DeepSeek LLM API<br/>chat completions / stream"]
    e2b["🧊 E2B 沙箱（可选）<br/>远程代码执行"]
    host["💻 本地宿主<br/>FS / subprocess / PTY / LSP"]

    human -->|"文本输入"| cli
    human -->|"浏览器会话"| webui
    human -->|"JSON-RPC / ACP"| acpc
    cli --> llm
    webui --> llm
    acpc --> llm
    zh -.->|"工具执行：沙箱内"| e2b
    zh -.->|"工具执行：本地"| host
```

**关键事实**（来源：architecture.md）：

- 无特权核心：扩展方式是「在别的插件旁边挂一个插件」，注册即 effect，卸载即回收
- Session log 是唯一真相：*Model-visible means logged*，模型请求内容必须可从日志重建（运行时断言强制）
- 换一个 provider = 换整个执行世界（fs/subprocess 共享一个执行世界，指向远程沙箱时 Bash/PTY/LSP 整体跟随）

---

## L2 容器

仓库物理结构 → 运行时容器。`packages/` 下 49 组均为 `@deepseek-ai/dsh-*` workspace 包（实测校准，README 表 47 行缺 `mcp/`、`runtime-diagnostics/` 登记）。

```mermaid
flowchart TB
    subgraph apps["apps/ — 可执行入口"]
        appcli["apps/cli<br/>dsh CLI 入口<br/>tsx ESM source launch"]
        appweb["apps/web<br/>Vite 浏览器应用"]
    end

    subgraph bundles["packages/bundle — Profile 组合层"]
        dbase["dsh-base<br/>所有 profile 的第一层<br/>模型适配/工具/持久化/沙箱/审批/设置"]
        dweb["dsh-web-app<br/>+ 浏览器应用"]
        dhead["dsh-headless<br/>+ 一次性 runner（无 server）"]
    end

    subgraph protos["协议与 SDK"]
        sdk["dsh-sdk<br/>JSON-RPC 协议 + TS client"]
        acp["packages/acp<br/>ACP server（仅自动化）"]
        api["packages/api + typert<br/>BFF 组装 + RPC 网关"]
        hostpkg["packages/host + client<br/>Web-GUI 服务端/浏览器端两半"]
        pysdk["python/<br/>Python SDK + 内置 runtime"]
    end

    subgraph foundation["地基"]
        cordis["vendor/<br/>Cordis 框架（rescope 后 vendored）"]
        nativepkg["native/<br/>node-addon-landlock-run<br/>进程约束原生插件"]
        pkgs["packages/*<br/>49 组能力/核心包（见 L3）"]
    end

    appcli --> dbase
    appweb --> dweb
    appcli -.->|"headless profile"| dhead
    dweb --> dbase
    dhead --> dbase
    sdk --> api
    acp --> pkgs
    api --> pkgs
    hostpkg --> pkgs
    bundles --> pkgs
    pkgs --> cordis
    pkgs --> nativepkg
    pysdk -.->|"进程边界"| sdk
```

**关键事实**（校准来源：packages/README.md、docs/development.md、AGENTS.md + 实测 `ls`）：

- Profile = 命名组合（存于 Harness home），列出 bundle 顺序 + 自带 `cordis.patch.yml`
- 层叠顺序：profile 列出的 bundle（按序）→ profile `cordis.patch.yml` → home 级 patch → `--patch` 覆盖层
- 查看实际启动树：`dsh --profile web --dump-config`，任何一行都可被上层 patch 替换
- `@deepseek-ai/cordis` 是所有 harness 包的 peerDependency；ESM only；`!!js`（非 `!js`）只允许出现在 plugin `config` 与 entry `disabled` 字段

### 仓库布局速查（实测校准，2026-08-15）

> AGENTS.md 布局段已过时：缺 `apps/`、`assets/`、`patches/`；packages 表缺 `mcp/`、`runtime-diagnostics/` 登记。下表以实测为准。

| 顶层目录 | 角色 |
|---|---|
| `apps/` | 可执行入口：`cli`（dsh CLI）、`web`（Vite 浏览器应用） |
| `packages/` | 49 组 `@deepseek-ai/dsh-*` workspace，位于 `packages/<group>/<pkg>/` |
| `vendor/` | Vendored Cordis 源码（rescope 后），manifest + sync 流程在 `vendor/README.md` |
| `python/` | Python SDK + 内置 runtime |
| `native/` | `@deepseek-ai/node-addon-landlock-run` 进程约束原生插件（source of record） |
| `examples/` | 可运行 `cordis.yml` leaves，叠加 `packages/examples` bundles |
| `.agents/` | Agent workflows + Agent Notes（`notes/`） |
| `docs/` | 架构、生成目录、复盘、cookbook |
| `scripts/` | 仓库 gates 与 generators |
| `website/` | VitePress 投影（选定的双语 docs 源） |
| `assets/` | 静态资源 |
| `patches/` | pnpm patch 记录 |

**packages/ 分组**（49 组，按角色归类）：

| 归类 | 组 |
|---|---|
| 产品 API 主轴 | `core/`（session/system-prompt/tools/agent/agent-loop/scope） |
| LLM 与执行能力 | `llm/` `e2b/` `subprocess/` `shell/` `terminal/` `code-runtime/` `sandbox/` `fs/` `lsp/` `skill/` `web/` `compaction/` `context/` `subagent/` `jobs/` `workflow/` `todo/` `plan/` `preset/` `guard/` |
| 会话与持久化 | `session/` `session-query/` `storage/` `workspace/` `identity/` `attachment/` `spill/` `settings/` `credentials/` `goal/` `schedule/` `feedback/` |
| 组合与自修改 | `bundle/` `extensions/` `hooks/` |
| 协议与 GUI | `sdk/` `acp/` `api/` `typert/` `host/` `client/` `boot/` `interaction/` `mcp/` |
| 支撑 | `examples/` `test-support/` `util/` `runtime-diagnostics/` |

**TypeScript 双聚合构建**（Host/Client 分开的根因是 declaration merging 冲突）：

| 聚合 | 覆盖 | 产物 |
|---|---|---|
| `tsconfig.host.json` | Host 包、examples、tests、scripts、website、`api/remotes` 的 Host 面 | Host lib + Typert 反射产物 |
| `tsconfig.client.json` | `packages/client/*`、`apps/web`、`api/remotes` 的 Client 面 | 浏览器 bundle |

- 两边在同一 Cordis `Context` 接口下 merge 不同的 service；一个 `ts.Program` 同时看到两边会报冲突，故必须分程序
- 构建顺序：`tsc -b host` → `tsdown host`（Typert 只在 Host phase 跑）→ `tsc -b client` → `tsdown client` → `build:web`
- lefthook：pre-commit（配对记录+oxlint+白空格+vendor manifest）、pre-merge-commit（配对检查）、pre-push（`pnpm run typecheck`）
- 环境：Node ^22.19 || >=24，pnpm 11.7.0 pin，ESM only（`"type": "module"`）

---

## L3 组件：核心包

产品 API 主轴（`ctx` key 来自 architecture.md 核心包表）：

```mermaid
flowchart LR
    subgraph corespines["packages/core — 产品 API 主轴"]
        session["core/session<br/>append-only SessionEvent 日志<br/>ctx.sessions"]
        sysprompt["core/system-prompt<br/>prompt 段落 + 工具 schema 组装<br/>ctx.systemPrompt"]
        toolsreg["core/tools<br/>scoped 工具注册表 + 执行管道<br/>ctx.tools"]
        agent["core/agent<br/>Agent 接口 + live 注册表<br/>ctx.agents"]
        agentloop["core/agent-loop<br/>默认驱动器（实现 Agent 接口）<br/>ctx.agentLoop"]
        scope["core/scope<br/>per-agent scoped 注册原语<br/>library，无 ctx key"]
    end

    subgraph llmpkg["packages/llm"]
        llmdef["llm/llm<br/>消息/流词汇表 + 适配器缝<br/>ctx.llm"]
    end

    agentloop -->|"读"| sysprompt
    agentloop -->|"调工具"| toolsreg
    agentloop -->|"读/写"| session
    agentloop -->|"经 ctx.llm 出站"| llmdef
    agent -->|"被驱动"| agentloop
```

**三个事件域**（选对域是大多数改动的第一个决策）：

| 域 | 用途 | 例子 |
|---|---|---|
| Session 事件 | 事实必须**熬过重载**（durable） | `session/event` 广播 `user/message`、`tool/result` |
| Agent 事件 (`agent/*`) | 观察/拦截**在途**工作 | inbox、step、status、request、validation |
| Capability 事件 | 给缝挂策略/适配器，**不 import loop** | `fs/*`、`tools/*`、`telemetry/*` |

---

## L3 组件：能力缝 seam

> 🔒 按 1-4-2 精读能力包后展开细节。当前为骨架。

一个 seam = 三个角色，缺一不算：

```mermaid
flowchart LR
    defn["Service Definition<br/>声明接口契约"]
    prov["Service Provider<br/>实现接口（可多实现）"]
    cons["Consumer<br/>使用接口<br/>通常是模型工具"]

    defn -.->|"编译期约束"| prov
    defn -.->|"编译期约束"| cons
    prov -->|"运行时注入"| cons
```

已知 seam 一览（`ctx` key → 典型 provider / consumer）：

| seam key | provider 变体 | 消费者 |
|---|---|---|
| `ctx.llm` | DeepSeek 适配器 | agent-loop |
| `ctx.fs` | 本地 / 沙箱 FS | fs 工具、LSP |
| `ctx.subprocess` | 本地进程树 | shell、terminal |
| `ctx.shell` | 本地 / pwsh | Bash 工具 |
| `ctx.terminals` | 持久会话 | dsh-tool-terminal |
| `ctx.sandbox` | Landlock / E2B | 消费者在 spawn 前 wrap argv |
| `ctx.agents`（subagent） | 子 agent / 委派 turn | subagent 工具 |
| `ctx.commands` | 人发命令（无模型 turn） | CLI 命令分发 |
| `ctx.jobs` | 后台工作 | `job_*` 工具 |

---

## L3 组件：Turn/Step 事件流

step = 一次模型请求 + 它调用的工具；turn = 零或多个 step。输入只走一条 inbox。

```mermaid
sequenceDiagram
    participant Inbox as Inbox
    participant Drv as agent-loop
    participant Log as session log
    participant LLM as ctx.llm
    participant Tools as tools pipeline

    Inbox->>Drv: claim 下一步输入 + 1 条排队消息
    Drv->>Drv: agent/pre-step（waterfall：改写或拒绝）
    Note over Drv: 拒绝/首条清空 → 关闭 turn（无 step，但记日志）
    Drv->>Log: turn/start, step/start, user/message
    Drv->>Log: deriveMessages() 从日志投影模型历史
    Drv->>LLM: agent/request → llm/stream
    LLM-->>Log: assistant/chunk* → assistant/message
    LLM->>Tools: tool/call*
    Tools->>Tools: pre-execute → execute → post-execute
    Tools-->>Log: tool/result*
    Drv->>Log: step/end
    alt 工具还欠请求 或 新输入到达
        Drv->>Inbox: claim → 下一个 step
    else 无欠账
        Drv->>Log: agent/turn-stopping → turn/end
    end
```

**waterfall vs serial**：`agent/pre-step`、`agent/request`、`llm/stream`、三个 `tools/*` 是 waterfall（listener 必须调 `next()` 下放）；`agent/turn-stopping` 是 serial 且无 `next()`。durable 事件：`turn/*`、`step/*`、`user/message`、`assistant/*`、`tool/*`。

**注入语义**：`agent.inject()` 的 context 落在 inbox 排队，直到下一条唤醒型消息到来才被 claim。

---

## L3 组件：Profile/Bundle 组合

```mermaid
flowchart TB
    empty[("空 entry 列表")]

    subgraph layer1["① bundle 层（profile 声明顺序）"]
        b1["dsh-base"]
        b2["dsh-web-app 或 dsh-headless"]
    end

    subgraph layer2["② profile 层"]
        p1["profile 自带 cordis.patch.yml"]
    end

    subgraph layer3["③ home 层"]
        h1["Harness home 的 cordis.patch.yml"]
    end

    subgraph layer4["④ CLI 覆盖层"]
        c1["--patch 参数 overlay"]
    end

    tree[("最终插件树<br/>dsh --dump-config 可见")]

    empty --> b1 --> b2 --> p1 --> h1 --> c1 --> tree
```

patch 按 row id 定位：整体替换该 row 的 config，或插入新 row。`dsh.profile` / `dsh.bundle` 字段在各自 `package.json` 里声明。

---

## L3 组件：插件形态与注册原语

> 解锁节点 1-2-3。已用最小 demo 实证（`docs/zj/plugin-philosophy-demo/`，可运行，输出解读见其 README）。

"一切皆插件"不是口号，而是三个具体原语 + 一个生命周期模型：

```mermaid
flowchart TB
    subgraph shapes["插件三种形态（都是插件）"]
        fn["函数插件<br/>export function apply(ctx)<br/>最常见"]
        obj["对象插件<br/>{ name, inject, apply(ctx) }"]
        cls["类插件<br/>class Svc extends Service<br/>super(ctx, 'key') 注册服务"]
    end

    subgraph prims["注册原语（都是 effect）"]
        on["ctx.on(event, listener)<br/>监听事件，卸载自动移除"]
        eff["ctx.effect(() => { ...; return disposer })<br/>包非 Cordis 资源，卸载跑 disposer"]
        plug["ctx.plugin(child)<br/>挂子插件，随父卸载<br/>返回 fiber（PromiseLike，await=等加载完）"]
        svc["Service 注册<br/>super(ctx,'key') 声明 ctx.key"]
    end

    subgraph fiber["fiber 状态机（每个插件实例一个）"]
        st1["PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED"]
        st2["↘ FAILED（apply/config 抛错，loud failure）"]
    end

    fn --> on
    fn --> eff
    obj --> plug
    cls --> svc
    plug --> fiber
    svc --> fiber
```

**关键事实**（demo 实测验证）：

- **inject 决定启动顺序，不是 yml 顺序**：`export const inject = ['greeter']` 声明依赖，Cordis 把插件停在 PENDING 直到服务存在。依赖消失 → 依赖方也卸载，服务回来 → 自动重载（热替换 provider 的基础）
- **注册即 effect，卸载即回收**：`ctx.on` / `ctx.effect` / `ctx.plugin` / Service 注册全部是 effect。demo 输出 `[effect] watcher timer cleaned up` + dispose 后无 tick 证明回收是真实的，无手动 removeListener 簿记
- **编译期与运行时两层接线**：`declare module '@deepseek-ai/cordis' { interface Context { greeter: ... } }` 是零运行时开销的类型声明合并（消费者类型安全）；`super(ctx, 'greeter')` 是运行时注册（消费者拿到实例）。两者缺一不可
- **无特权核的实证**：demo 内无一行引导代码、无 main() 启动序列、无 import 具体实现。插件描述贡献（服务/监听/effect），`cordis.yml` 组合，Cordis 管生命周期。dsh 的 `ctx.tools` / `ctx.llm` / `ctx.sessions` / agent-loop 都是这样挂的插件
- **`!!js`（非 `!js`）** 只允许出现在 plugin `config` 与 entry `disabled` 字段，其他 metadata 保持字面量，环境选择插件用 overlay

### 启动顺序：inject 决定，不是 yml 顺序

`cordis.yml` 回答"系统里有哪些插件"（一个集合）；**"谁先启动"由 Cordis 从每个插件的 `inject` 声明构建依赖图、拓扑排序后推导**，与 yml 行序无关。yml 是声明存在性，inject 是声明依赖，顺序是推导结果。

```mermaid
flowchart LR
    subgraph list["yml 清单（集合，无顺序语义）"]
        a["main"]
        b["greeter"]
    end
    subgraph deps["inject 声明（依赖图）"]
        c["main --inject--> greeter"]
    end
    subgraph order["拓扑排序（真实启动序列）"]
        d["1. greeter"]
        e["2. main"]
        f["3. watcher（apply 内 ctx.plugin 动态挂载）"]
    end
    list --> deps
    deps --> order
```

**顺序发生在两个层面，规则统一**：

| 层面 | 顺序来源 | demo 示例 |
|---|---|---|
| 静态（yml 列出的插件） | inject 依赖图拓扑排序 | greeter → main |
| 动态（apply 内 ctx.plugin） | 依赖者已启动后才挂载 | main → watcher |

**反例验证**（demo 可复现）：把 `cordis.yml` 两行对调为 main 在前、greeter 在后，运行结果不变——greeter 照样先启动，因为 main 的 `inject: ['greeter']` 声明了依赖。watcher 是更硬的证据：它**不在 yml 里**（main apply 内 `ctx.plugin(watcher)` 动态挂载），却严格排在 main 之后——若顺序由 yml 决定，它根本不该出现。

**设计动机**：插件只说"我需要什么"，不问"谁给我、何时给我"，可组合性由此成立；顺序是局部声明推导出的全局结果，**没有任何文件掌握全局启动顺序**——若靠 yml 行序，yml 就成了"特权核"（每个插件都得先知道自己的位置），与无特权核哲学直接冲突。

**哲学总结（500 字）**：插件式架构把"扩展"从特权降级为常态。没有需要打补丁的核心，因为核心本身就是一组插件按顺序叠加的结果——`dsh-base` 是第一层，profile/bundle 在其上覆盖，任何一行 `--dump-config` 输出都可被 patch 替换。能力的边界不是"核心 vs 扩展"，而是"谁声明了接口（Service Definition）、谁实现（Provider）、谁消费（Consumer）"。注册即 effect 意味着**所有权是运行时声明的，不是代码静态归属的**：卸载一个 provider，它的服务、监听、子插件、计时器整体回收，依赖它的插件随之卸载并等待重载。这带来了两个工程后果：其一，热替换成为第一等公民——换 provider 就是 unload + mount，消费方无感重启；其二，无特权核意味着**没有隐藏的魔法**——你能读到的插件树就是全部，`dsh --dump-config` 是事实来源，任何行为都能追溯到某个插件的一行注册。

---

## L4 代码：关键接口

> 🔒 待 1-3（Cordis 心智模型）与 1-4（按包精读）解锁。届时补充：
> - `ctx.effect()` / `ctx.on()` 注册语义与 unwind
> - declaration merging 事件表（`SessionEventMap` / `AgentEvents`）
> - `Agent` 接口签名与 agent handle 取消语义
> - 典型能力包的三件套代码位置（以 fs 或 skill 为例）

---

## 新行为落点速查（摘自 architecture.md）

| 目标 | 机制 |
|---|---|
| 加模型 provider | 在 `ctx.llm` 上注册适配器 |
| 加模型可见能力 | 在 `ctx.tools` 注册，schema 自动进 prompt 组装 |
| 单会话不同能力集 | 组 agent preset；service row 需 `isolate` realm |
| 加 shell 执行 | 注册 `ctx.shell` backend；本地实现经 `ctx.subprocess` spawn |
| 拦截请求/工具/turn | 用对应 `agent/*` 或 `tools/*` 事件 |
| 注入模型可见上下文 | `agent.inject()`，落在下一个被接纳的请求 |
| 加 durable 会话状态 | 扩展 `SessionEventMap`，从日志渲染和重放 |
| fork 活会话 | `ctx.sessions.fork(source, boundary?, childSessionId?)` |
| 把注册限定到单 agent | 用该 agent 的 `agent.ctx` |
