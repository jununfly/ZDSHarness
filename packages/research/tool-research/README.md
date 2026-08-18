# @deepseek-ai/dsh-tool-research

English | [中文](README.zh.md)

This Consumer registers `research_collect_evidence(brief)`. One call accepts a complete `zj-research-brief/v1`, discovers candidates when requested, resolves every selected repository to an immutable commit, navigates the commit tree, and reads bounded canonical files. It returns `zj-research-evidence-digest/v1`: pinned repository identities without commit trees, candidate scores, at most one canonical excerpt per repository/criterion pair, unknown criteria, navigation diagnostics, and `ledgerFingerprint`. After successful collection it appends the complete `zj-verified-evidence-ledger/v1` as `research/evidence-collected` to the calling agent's durable session; the report Consumer reads that sealed event instead of asking the model to reproduce it. The tool does not expose raw repository or DeepWiki reads; missing coverage remains in `unknownCriteria`.

`deepWikiUrl` enables internal Streamable HTTP MCP navigation. `externalNavigationRepositories` is an exact allowlist; omitted repositories stay on deterministic local-tree navigation. `deepWikiTimeoutMs` bounds each external call. DeepWiki output can select paths but cannot support claims.

## Model Experience

### Evidence guidance and tool schema

#### What the model sees

The model sees the generated [`research_collect_evidence` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-research) and guidance that canonical evidence may support claims while `unknownCriteria` never supports a negative claim.

#### Token effect

The schema adds a fixed prefix cost. The complete brief and bounded digest remain in model history until compaction; commit trees and the sealed ledger do not enter the tool result.

#### KV Cache effect

Prefix-stable while the plugin, guidance, and schema remain unchanged.

## Known Limitations and Deferred Work

- External navigation needs an exact repository allowlist because GitHub repository references do not disclose visibility.
