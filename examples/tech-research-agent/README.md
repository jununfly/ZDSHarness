# tech-research-agent

English | [中文](README.zh.md)

This example composes a production-oriented technical solution research agent over DeepSeek, structured github.com repository access, local filesystem publication, JSON-RPC, and ACP. It scores GitHub recall by topic evidence, deep-reads selected repositories, and publishes authoritative Markdown plus derived offline HTML.

## Run through the TypeScript SDK

Provide `DEEPSEEK_API_KEY` through the environment or the gitignored root `.env`; `GITHUB_TOKEN` is optional and increases GitHub API quota. Then load [`cordis.yml`](cordis.yml) through the JSON-RPC server and SDK client, supplying a research topic and an unused `.md` destination. The example refuses to overwrite either report artifact. Its model catalog caps each response at 32,768 output tokens so a complete Report IR fits without inheriting the provider's larger default.

## Workflow

The model submits one versioned multi-repository brief with shared criteria. The compiler may combine explicit repositories with deterministic discovery, uses DeepWiki only to suggest paths for an allowlisted repository, pins every selected repository before canonical GitHub reads, and records uncovered repository/criterion pairs as unknown. The complete ledger stays in the session; the model receives a bounded digest and submits evidence-linked Report IR. Reports use Key-Value concepts, C4 and Mermaid diagrams, and a final metric matrix whose entries define units, measurement method, applicability, and expected values.

[`cordis.snapshot.yml`](cordis.snapshot.yml) replaces external providers for the keyless deterministic research-flow snapshot. [`cordis.acp.yml`](cordis.acp.yml) exposes the same research policy and publisher through ACP; the transport changes, but report semantics do not.

## Verification entry points

The keyless snapshot exercises search, deep-read, publication, the exact Markdown source, and the offline HTML projection through the real JSON-RPC runtime. Credential-gated e2e coverage runs the same composition against DeepSeek and github.com; its owned watchdog closes the runtime before reporting a bounded failure, so an unfinished model turn cannot outlive the test. ACP coverage drives the real stdio connection.

The composition tracks identical `research_collect_evidence` calls and injects escalating reminders at repetitions 2, 3, and 5. A `GITHUB_RATE_LIMITED` result additionally cancels the current turn after preserving the original tool error and retry time; a later user turn may retry after the upstream window changes. Argument changes cannot bypass this fail-fast behavior.

The report publisher's package reference owns the complete [publication contract](../../packages/research/tool-research-report/README.md#publication-contract).
