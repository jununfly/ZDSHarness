# Agent Note: 技术方案调研 agent

Status: implemented

[English](2026-08-17-technical-research-agent.md) | 中文

## 问题

技术方案调研任务需要的不只是通用 Web 召回。agent（智能体）必须发现相关 GitHub 项目，把按 star 排序的召回与任务特定的相关度分开，保留来源时间和证据，串联概念与架构图，定义可比较的技术指标，并发布一份同时适用于 agent 和人类的结果。自由格式回答无法在 JSON-RPC 与 ACP 入口之间强制保证这些证据、结构、引用和产物要求。

## 决策

[`examples/tech-research-agent`](../../../../examples/tech-research-agent) 中的可运行组合把一套共享调研策略与三项插件职责组合起来。

[`dsh-github`](../../../../packages/github/github) 定义提供方无关的 `ctx.github` 能力，[`dsh-github-rest`](../../../../packages/github/github-rest) 通过 REST 提供 github.com 事实。调研组合通过[调研证据与报告编译器](2026-08-18-research-evidence-and-report-compilers.md)中定义的完整 brief compiler 消费这项能力，不挂载原始 GitHub Consumer。较新的决策负责固定 revision 的文件读取、候选评分、证据权威性、Report IR、健康状态和 skill 复用。

[`dsh-tool-research-report`](../../../../packages/research/tool-research-report) 把 Markdown 视为唯一报告事实源，并确定性地派生同名的单文件离线 HTML 投影。发布器负责必需章节顺序、Key 定义／引用完整性、安全链接协议、Mermaid 解析、目标冲突与仅在目标不存在时创建的写入。它嵌入固定版本的 Mermaid runtime，使派生产物无需网络依赖即可渲染。HTML 写入失败时，已经写入的规范 Markdown 会被保留，并通过 `RESEARCH_REPORT_HTML_WRITE_FAILED` 报告其路径。

JSON-RPC SDK 与 ACP 配置挂载相同的调研策略、能力 Consumer、发布器和重复调用提醒器。该提醒器只跟踪参数相同的 `research_collect_evidence`，在第 2、3、5 次重复时注入逐级增强的上下文，但不会替换原始工具错误。`GITHUB_RATE_LIMITED` 结果会在保留结果后取消当前调研 turn，因此改变参数无法把同一个未变化的上游窗口转换成重复调用。模型目录把技术调研响应限制为 32,768 token；策略会直接提交 Report IR，不先在推理中复写。传输专属设置不会重新定义评分或报告语义。

## 曾考虑的替代方案

**使用通用 Web 搜索发现 GitHub 项目。** 否决，因为非结构化摘要无法提供稳定的仓库标识、原始 star 数、README 状态或统一的带时间戳错误词汇。专用能力把提供方机制隐藏在小型结构化接口之后，并把任务特定评分留给组合。

**让模型独立生成 HTML。** 否决，因为两份独立创作的报告可能彼此矛盾。确定性投影让 Markdown 保持为 AI-readiness 事实源，并把 HTML 作为 human-readiness 产物。

**先发布 Markdown，只校验 HTML 渲染器。** 否决，因为缺失章节、损坏的 Key 引用、不支持的链接或无效 Mermaid 都会成为持久事实源缺陷。发布器会在创建任一目标前校验所有由该包负责的不变式。

**为 JSON-RPC 与 ACP 分别创建调研策略。** 否决，因为传输专属提示词会使等价任务产生不同的评分与报告义务。

## 后果

模型提交一个完整 brief，并发布同时返回 Markdown 与派生 HTML 路径的报告。无密钥 JSON-RPC 快照覆盖固定完整的 collect → prepare → publish 流程和精确产物；凭据门控的 e2e 覆盖使用实时 github.com 与 DeepSeek；ACP e2e 覆盖通过真实 stdio 连接驱动同一组合。未变化的 GitHub 限流失败保持可审计并确定性结束 turn；其他参数相同的调用循环仍使用提示式升级。

该能力目前只支持 github.com。每份 HTML 报告都携带 Mermaid runtime，因此会显著大于 Markdown 事实源。跨两个文件的发布有意不采用事务：Markdown 写入后的失败会留下可恢复的权威产物，并报告其规范路径。
