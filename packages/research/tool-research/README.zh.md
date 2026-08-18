# @deepseek-ai/dsh-tool-research

[English](README.md) | 中文

该 Consumer 注册 `research_collect_evidence(brief)`。一次调用接受完整 `zj-research-brief/v1`，按需发现候选项目，把每个选中仓库解析到不可变 commit，导航 commit tree，并读取有界 canonical file。它返回 `zj-research-evidence-digest/v1`：不含 commit tree 的固定仓库身份、候选评分、每个仓库／判据组合最多一条 canonical excerpt、unknown criterion、导航诊断与 `ledgerFingerprint`。采集成功后，它会把完整 `zj-verified-evidence-ledger/v1` 作为 `research/evidence-collected` 追加到调用 agent 的持久会话；报告 Consumer 读取该 sealed event，无需让模型重新生成。工具不暴露原始仓库读取或 DeepWiki 调用；缺失覆盖保留在 `unknownCriteria` 中。

`deepWikiUrl` 启用内部 Streamable HTTP MCP 导航。`externalNavigationRepositories` 是精确 allowlist；未列出的仓库使用确定性本地 tree 导航。`deepWikiTimeoutMs` 限制每次外部调用。DeepWiki 输出只能选择路径，不能支持 claim。

## Model Experience

### Evidence guidance and tool schema

#### What the model sees

模型看到生成的 [`research_collect_evidence` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-research)，以及以下指引：canonical evidence 可以支持 claim，`unknownCriteria` 不能支持否定 claim。

#### Token effect

Schema 增加固定前缀成本。完整 brief 与有界 digest 在 compaction 前保留在模型历史中；commit tree 与 sealed ledger 不进入工具结果。

#### KV Cache effect

插件、指引与 schema 不变时，前缀保持稳定。

## Known Limitations and Deferred Work

- GitHub repository reference 不包含可见性信息，因此外部导航需要精确仓库 allowlist。
