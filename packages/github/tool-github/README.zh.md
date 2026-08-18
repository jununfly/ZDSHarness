# @deepseek-ai/dsh-tool-github

[English](README.md) | 中文

本 Consumer 基于 [`ctx.github`](../github/README.md) 暴露 `github_search_repositories` 和 `github_read_repository`。两个工具都返回规范 JSON，并把取消信号传给提供方。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `searchMaxResults` | `30` | 每次搜索强制执行的候选上限，范围 1 至 30。 |
| `timeoutMs` | `30000` | 附加到每个工具的正数协作超时。 |

搜索调用显示为 search 类型通用卡片；仓库读取使用通用卡片。两者都是并发安全的只读操作。提示词说明 github.com、按 star 降序召回、观察时间、后续深读和仓库 URL 引用。

## 模型体验

### GitHub 指引与工具 schema

#### 模型所见

该插件作用域中的每个请求都会收到 github.com 发现与引用指引。模型还会看到生成的 [`github_search_repositories` 与 `github_read_repository` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-github)：搜索接受 `query`，读取接受 `owner` 和 `name`。

#### Token 影响

插件处于活动状态时，提示词与两个 schema 会增加固定的请求前缀成本。

#### KV Cache 影响

当插件、提示词、可见工具定义及其顺序保持不变时，前缀稳定；激活、资源释放或限定作用域的限制可能从首个变化 token 起使复用失效。

### 仓库结果与错误

#### 模型所见

规范 JSON 会保留 star 数、topic、许可证、语言、更新时间、README 可用性、仓库 URL、观测时间和截断状态，不会编造缺失的可选事实。搜索结果始终受 `searchMaxResults` 限制；提供方与参数校验失败会作为工具错误返回。

#### Token 影响

搜索结果最多包含 30 个候选项；仓库读取可能在压缩前保留 README 文本。

#### KV Cache 影响

仅追加；每项结果位于可复用的请求前缀之后。

## 已知限制与延期工作

- 工具暴露 GitHub 事实而非主题匹配分；评分及其证据由调研策略负责。
- 除 GitHub 查询字符串和部署方控制的结果上限外，不暴露其他搜索控制项。
