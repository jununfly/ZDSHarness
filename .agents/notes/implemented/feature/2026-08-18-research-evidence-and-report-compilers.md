# Agent Note: Research evidence and report compilers

Status: implemented

English | [中文](2026-08-18-research-evidence-and-report-compilers.zh.md)

## Problem

The initial technical research composition exposed repository search and README reads directly to the model. Prompt instructions carried revision consistency, evidence authority, scoring separation, report structure, publication counts, and runtime facts. That arrangement could not prevent a moving branch from mixing sources, a navigation summary from becoming evidence, an uncovered criterion from becoming a negative claim, or a model-authored receipt from disagreeing with actual execution. The same research method also could not be reused by a skill without copying prompt behavior.

## Decision

[`dsh-research`](../../../../packages/research/research) owns three versioned values: `zj-research-brief/v1`, `zj-verified-evidence-ledger/v1`, and `zj-research-report-ir/v1`. One `EvidenceCompiler` call handles a complete multi-repository brief with shared criteria and a complete-run budget. It can combine explicit repositories with deterministic GitHub discovery, preserves stars and topic match as separate ledger facts, resolves every selected repository to a commit before reading its tree or files, retains at most one canonical excerpt per repository/criterion pair, and records every uncovered pair as unknown.

Repository navigation and canonical evidence have separate types. The deterministic navigator and the optional internal DeepWiki MCP adapter return candidate paths only. DeepWiki is enabled through an exact repository allowlist, its tools are not registered for the model, and its failure records a diagnostic before heuristic fallback. Only GitHub files read at the pinned commit can enter canonical evidence. The Agent Consumer writes the complete ledger to `research/evidence-collected` and returns a bounded `zj-research-evidence-digest/v1` without repository trees; Report prepare reads the durable ledger instead of accepting it from the model. Cache entries match the normalized brief, policy version, and all repository revisions; the standalone CLI stores schema-validated entries atomically under the Harness home and fails loudly on corruption or key mismatch.

Report IR makes Evidence → Claim → Comparison → Recommendation references explicit. The compiler rejects critical claims without canonical evidence, broken references, incomplete metric definitions, missing diagram roles, and report candidate scores that differ from the ledger. It deterministically projects both `technical-c4/v1` and `zj-draft/v1`; the latter includes only claim-cited sources and emits ordinary inline links plus a visible numbered source list, while the sealed ledger retains all evidence. [`dsh-research-report`](../../../../packages/research/research-report) validates each family's Markdown and derives offline HTML with the same citation destinations. [`dsh-tool-research-report`](../../../../packages/research/tool-research-report) validates both artifacts before issuing a single-use publication token. Publish uses create-if-absent writes, keeps Markdown authoritative, and appends application-owned receipt and evaluation events.

Research health derives from durable facts rather than model prose. The session projection exposes prepare attempts, invalid attempts, publish count, the latest receipt, disjoint model-token usage, and the latest evaluation. Six correctness fields have a 100% healthy threshold. Collection duration, source bytes, source files, cache use, coverage, degradation, and model tokens have low-cardinality OTel instruments through [`dsh-research-telemetry-otel`](../../../../packages/research/research-telemetry-otel). Efficiency thresholds appear only after 30 comparable samples and use median, p95, and median absolute deviation.

[`dsh-research-cli`](../../../../packages/research/research-cli) exposes the same compilers through `zj-research-cli/v1` on stdin/stdout, including family-aware HTML derivation from the final Markdown. Its `describe` operation supports fail-loud compatibility checks. ZAgentic's `zj-research` and `zj-research-report` skills call this standalone protocol; their Git repository remains the skill source of record, while agent runtime directories are installation projections.

The earlier [technical solution research agent](2026-08-17-technical-research-agent.md) still owns the Markdown-first artifact and shared JSON-RPC/ACP composition decisions. This note supersedes its model-controlled repository reading, scoring, report assembly, and execution-fact mechanisms.

## Alternatives considered

**Keep raw GitHub tools beside the compiler.** Rejected because the model could bypass revision pinning, budgets, unknown handling, and cache identity. Research presets expose only the complete-brief compiler; raw GitHub Consumers remain available to other compositions.

**Treat DeepWiki answers as evidence.** Rejected because derived wiki prose may be stale and cannot prove what a fixed repository revision contains. DeepWiki improves path recall only; GitHub source bytes retain authority.

**Let Agent and skill routes author separate Markdown.** Rejected because comparisons would conflate orchestration differences with different facts and validation rules. Both routes share the ledger and Report IR compilers while retaining their own interaction flow and report family.

**Infer health from final response text.** Rejected because a model cannot authoritatively know publication races, consumed tokens, file paths, hashes, durable counts, or provider token accounting. Session events, projections, receipts, and metric exports own those facts.

## Consequences

The common research caller supplies topic, criteria, repository seeds or discovery, policy version, and file, byte, and deadline budgets; it does not orchestrate individual GitHub or DeepWiki reads. The compiler divides remaining file and byte capacity by the remaining repository count, so unused capacity flows forward without allowing an earlier repository to consume the complete run. Missing evidence and deadline exhaustion remain visible and can block a critical report claim. The fixed-corpus real-API e2e uses the same three harness repositories as the milestone comparison, while deterministic tests cover fallback, revision drift, fair allocation, cache identity and corruption, deadline degradation, score tampering, duplicate publication, receipt mismatch, and the 30-sample threshold.

DeepWiki adds external latency without adding evidence authority and therefore needs an explicit allowlist. The deadline stops canonical collection without converting uncovered criteria into negative claims; provider selection and revision pinning retain their own upstream failure semantics. OTel exports raw efficiency observations before the 30-run floor rather than pretending an early threshold is stable. The credential-gated Agent scenario owns a watchdog that closes its JSON-RPC runtime before reporting timeout diagnostics; the test runner's timeout is not the lifecycle controller. Native Agent-versus-skill blind review remains a milestone evaluation, not a deterministic acceptance rule. A comparative evaluation supplies the same versioned Research Brief to both routes: sharing compilers guarantees evidence and validation semantics, but independently chosen criteria define different decision functions.
