# ZHarness 架构全景（C4 视角）

> **数据源文件**：本 md 是唯一数据源，HTML 由 `gen_panorama_html.py` 从本文件生成，禁止手改 HTML。
> **同步策略**：随学习路线图（`learning_roadmap.json`）进度逐层展开。每节标注解锁节点与状态。
> 最后更新：2026-08-15（解锁至 1-2-1）

## 进度索引

| C4 层 | 章节 | 解锁节点 | 状态 |
|---|---|---|---|
| L1 | [系统上下文](#l1-系统上下文) | 1-2-1 | ✅ 已展开 |
| L2 | [容器](#l2-容器) | 1-2-1 | ✅ 已展开 |
| L3 | [组件：核心包](#l3-组件核心包) | 1-2-1 | ✅ 已展开 |
| L3 | [组件：能力缝 seam](#l3-组件能力缝-seam) | 1-4-2 | 🔒 待展开（已有骨架） |
| L3 | [组件：Turn/Step 事件流](#l3-组件turnstep-事件流) | 1-2-1 | ✅ 已展开 |
| L3 | [组件：Profile/Bundle 组合](#l3-组件profilebundle-组合) | 1-2-1 | ✅ 已展开 |
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

仓库物理结构 → 运行时容器。`packages/` 下 50+ 分组均为 `@deepseek-ai/dsh-*` workspace 包。

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
        api["packages/api<br/>BFF 组装 + Typert RPC 网关"]
        pysdk["python/<br/>Python SDK + 内置 runtime"]
    end

    subgraph foundation["地基"]
        cordis["vendor/<br/>Cordis 框架（rescope 后 vendored）"]
        nativepkg["native/<br/>node-addon-landlock-run<br/>进程约束原生插件"]
        pkgs["packages/*<br/>50+ 能力/核心包（见 L3）"]
    end

    appcli --> dbase
    appweb --> dweb
    appcli -.->|"headless profile"| dhead
    dweb --> dbase
    dhead --> dbase
    sdk --> api
    acp --> pkgs
    api --> pkgs
    bundles --> pkgs
    pkgs --> cordis
    pkgs --> nativepkg
    pysdk -.->|"进程边界"| sdk
```

**关键事实**：

- Profile = 命名组合（存于 Harness home），列出 bundle 顺序 + 自带 `cordis.patch.yml`
- 层叠顺序：profile 列出的 bundle（按序）→ profile `cordis.patch.yml` → home 级 patch → `--patch` 覆盖层
- 查看实际启动树：`dsh --profile web --dump-config`，任何一行都可被上层 patch 替换
- `@deepseek-ai/cordis` 是所有 harness 包的 peerDependency；ESM only；`!!js`（非 `!js`）只允许出现在 plugin `config` 与 entry `disabled` 字段

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
