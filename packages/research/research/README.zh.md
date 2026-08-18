# @deepseek-ai/dsh-research

[English](README.md) | 中文

本包定义 `zj-research-brief/v1`、`zj-verified-evidence-ledger/v1` 与 `zj-research-report-ir/v1`。`EvidenceCompiler` 接受显式仓库、确定性 GitHub discovery request 或两者组合；stars 与 topic match 作为两个独立事实保留；每个选中仓库在读取目录树或文件前解析到不可变 commit；整次运行的文件数和字节预算以确定性 fair share 分配到各仓库，执行 deadline，并且每个仓库／判据组合最多保留一条固定 commit 的 canonical excerpt。没有匹配证据的判据进入 `unknownCriteria`，缺失与预算耗尽不会被解释为否定能力声明。

确定性导航器按判据关键词选择文档与 manifest 文件，并以根 README 和 manifest 兜底。可选 DeepWiki Streamable HTTP MCP adapter 只为显式允许的仓库提供候选路径；其工具名不会进入模型工具 registry，失败时回退到确定性导航。GitHub 始终是 canonical source，每条证据都携带仓库、commit、路径、URL 与摘录来源。

Cache port 按 normalized brief、policy version 与不可变仓库 revision 保存 sealed ledger。`MemoryResearchEvidenceCache` 服务单个 runtime；`FileResearchEvidenceCache` 原子发布经过校验的 JSON entry，并在损坏、非普通文件或 key 不匹配时 loud fail。Report validation 检查完整的 Evidence → Claim → Comparison → Recommendation 引用图，并拒绝与 ledger 不一致的候选项目 popularity 或 topic match。`zj-draft/v1` 投影只列出 claim 引用的 evidence，而 sealed ledger 保留完整审计记录。发布健康状态提供 durable session projection、verified receipt、六个硬正确性事实，以及不含报告正文或源码的低基数 metric points。

## Model Experience

通过暴露 resolved brief 并投影 verified ledger 的研究 Consumer 间接影响模型。本 library 自身不贡献 prompt 文本或工具 schema。

#### KV Cache effect

没有直接失效影响；模型可见 request prefix 变更由 Consumer 负责。

## Known Limitations and Deferred Work

- 仓库目录树响应必须完整；GitHub 会拒绝截断目录树，不会基于部分覆盖编译结果。
