# @deepseek-ai/dsh-tool-research-report

[English](README.md) | 中文

该 Consumer 注册 `prepare_research_report(report, outputPath)` 和 `publish_research_report(validationToken)`。Prepare 从调用 agent 的持久会话读取最新 `research/evidence-collected` ledger，把完整 Report IR 编译成权威 Markdown，在不产生文件系统效果的情况下校验 sealed evidence link 与派生 HTML，并返回结构化 diagnostics 或一次性 token。Publish 只接受该 token，通过 `ctx.fs` 写入 Markdown 和同名离线 HTML。

## 发布约定

`outputPath` 必须以 `.md` 结尾。Prepare 校验 Evidence → Claim → Comparison → Recommendation 引用，要求每条 critical claim 都有 canonical evidence，对照 ledger 校验候选项目 stars 与 topic match，检查指标定义，编译必需章节顺序，并校验 Key 引用、链接协议与每个 Mermaid 围栏。Publish 拒绝已存在的 Markdown 或 HTML 目标，并通过仅在目标不存在时创建的写入语义拒绝发布竞争。Token 在文件系统 I/O 前进入 `publishing`，最终进入 `published` 或 `failed`；后续每次使用都抛出 `RESEARCH_REPORT_TOKEN_CONSUMED`。

Technical-C4 投影依次输出 `调研主题`、`输入材料与观察时间`、`Key-Value 概念索引`、`C4 System Landscape`、`候选项目表`、`深读项目卡片`、`方案族及适用场景对比`、`C4 Context/Container 与子主题图`、`关键技术指标矩阵`、`建议、限制与待验证事项` 和 `来源清单`。概念定义使用字面形式 `` - Key: `identifier` ``，引用由 compiler 输出。

共享 [`dsh-research-report`](../research-report) library 使用固定版本的 `marked` 与 Mermaid 派生 HTML。Markdown 原始 HTML 会被转义；链接仅允许 HTTP、HTTPS、mailto 和相对目标；Mermaid 以严格安全模式运行。如果 Markdown 成功后 HTML 写入失败，`ResearchReportError` 使用 `RESEARCH_REPORT_HTML_WRITE_FAILED`，并指出已保留的规范 Markdown 路径。

## Model Experience

### 发布指引与工具 schema

#### What the model sees

该插件作用域中的每个请求都会要求模型一次提交完整 Report IR、修正 prepare diagnostics、发布一个 validated token，并把执行事实交给应用生成。模型会看到生成的 [`prepare_research_report` 和 `publish_research_report` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-research-report)。

#### Token effect

提示词和 schema 会增加固定的请求前缀成本。Prepare 调用会在压缩前保留 Report IR 及其 ledger；publish 只保留 token。

#### KV Cache effect

当插件、提示词文本和 schema 保持不变时，前缀稳定；激活、资源释放或限定作用域的工具限制可能从首个变化 token 起使复用失效。

### 发布结果与错误

#### What the model sees

Prepare 返回带有全部独立 diagnostics 的 `status: "invalid"`，或带有 token 和 report hash 的 `status: "validated"`。Publish 返回规范绝对路径与相同 hash。未知和已消费 token 分别使用 `RESEARCH_REPORT_TOKEN_UNKNOWN` 与 `RESEARCH_REPORT_TOKEN_CONSUMED`；Markdown 写入后的 HTML 失败返回 `RESEARCH_REPORT_HTML_WRITE_FAILED` 和已保留的 Markdown 路径。

#### Token effect

Prepare 新增 diagnostics 或较小的 validation receipt；publish 新增较小的确定性 publication receipt。

#### KV Cache effect

仅追加；结果位于可复用的请求前缀之后。

## Known Limitations and Deferred Work

- 发布由两次仅在目标不存在时创建的写入组成，并非文件系统事务；HTML 失败时保留权威 Markdown，并永久消费 token。
