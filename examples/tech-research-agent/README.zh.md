# tech-research-agent

[English](README.md) | 中文

该示例将 DeepSeek、结构化 github.com 仓库访问、本地文件系统发布、JSON-RPC 与 ACP 组合为面向生产的技术方案调研 agent（智能体）。它根据主题证据为 GitHub 召回结果评分，深读选定仓库，并发布权威 Markdown 与派生的离线 HTML。

## 通过 TypeScript SDK 运行

通过环境变量或被 git 忽略的根目录 `.env` 提供 `DEEPSEEK_API_KEY`；`GITHUB_TOKEN` 可选，用于提高 GitHub API 配额。随后通过 JSON-RPC 服务器和 SDK 客户端加载 [`cordis.yml`](cordis.yml)，提供调研主题和未使用的 `.md` 目标路径。该示例拒绝覆盖任一报告产物。其模型目录把每次响应的输出上限设为 32,768 token，使完整 Report IR 能够容纳在一次响应内，同时避免继承提供方更大的默认值。

## 工作流

模型提交一份带共享判据的版本化多仓库 brief。Compiler 可以组合显式仓库与确定性 discovery，只为 allowlist 中的仓库使用 DeepWiki 建议路径，在 canonical GitHub 读取前固定每个选中仓库，并把未覆盖的仓库／判据组合记录为 unknown。完整 ledger 留在 session 中；模型只接收有界 digest，再提交证据相连的 Report IR。报告使用 Key-Value 概念、C4 与 Mermaid 图，并以指标矩阵收尾；每项指标都定义单位、测量方法、适用条件和预期值。

[`cordis.snapshot.yml`](cordis.snapshot.yml) 会替换外部提供方，用于无密钥且确定性的完整调研流程快照。[`cordis.acp.yml`](cordis.acp.yml) 通过 ACP 暴露相同的调研策略和发布器；传输方式不同，但报告语义不变。

## 验证入口

无密钥快照通过真实 JSON-RPC runtime 验证搜索、深读、发布、精确 Markdown 事实源和离线 HTML 投影。凭据门控的 e2e 覆盖使用相同组合连接 DeepSeek 与 github.com；其自有 watchdog 会先关闭 runtime，再报告有界失败，因此未完成的模型 turn 不会在测试结束后继续运行。ACP 覆盖驱动真实 stdio 连接。

该组合会跟踪参数完全相同的 `research_collect_evidence` 调用，并在第 2、3、5 次重复时注入逐级增强的提醒。`GITHUB_RATE_LIMITED` 结果还会在保留原始工具错误和重试时间后取消当前 turn；上游窗口变化后，后续用户 turn 可以重试。修改参数无法绕过这项 fail-fast 行为。

报告发布器的包参考文档负责完整的[发布约定](../../packages/research/tool-research-report/README.md#publication-contract)。
