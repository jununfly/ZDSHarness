# @deepseek-ai/dsh-research

English | [中文](README.zh.md)

This package defines `zj-research-brief/v1`, `zj-verified-evidence-ledger/v1`, and `zj-research-report-ir/v1`. `EvidenceCompiler` accepts explicit repositories, a deterministic GitHub discovery request, or both; it retains stars and topic match as separate facts, resolves each selected repository to an immutable commit, allocates complete-run file and byte budgets by deterministic fair share across repositories, enforces a deadline, and retains at most one commit-pinned canonical excerpt per repository/criterion pair. A criterion without matching evidence remains in `unknownCriteria`; absence and budget exhaustion never become negative capability claims.

The deterministic navigator selects documentation and manifest files by criterion keywords, then falls back to root README and manifests. The optional DeepWiki Streamable HTTP MCP adapter contributes candidate paths only for explicitly allowed repositories; its tool names never enter the model tool registry, and failure falls back to deterministic navigation. GitHub remains canonical and every evidence item carries repository, commit, path, URL, and excerpt provenance.

The cache port keys sealed ledgers by normalized brief, policy version, and immutable repository revisions. `MemoryResearchEvidenceCache` serves one runtime; `FileResearchEvidenceCache` atomically publishes validated JSON entries and fails loudly on corruption, non-regular files, or key mismatches. Report validation checks the complete Evidence → Claim → Comparison → Recommendation graph and rejects candidate popularity or topic-match values that differ from the ledger. The `zj-draft/v1` projection lists only evidence cited by claims while the sealed ledger retains the complete audit record. Publication health exposes a durable session projection, a verified receipt, six hard correctness facts, and low-cardinality metric points without report or source text.

## Model Experience

Indirectly, through research Consumers that expose a resolved brief and project the verified ledger. This library contributes no prompt text or tool schema by itself.

#### KV Cache effect

No direct invalidation; the Consumer owns model-visible request-prefix changes.

## Known Limitations and Deferred Work

- Repository tree responses must be complete; GitHub rejects truncated trees instead of compiling partial coverage.
