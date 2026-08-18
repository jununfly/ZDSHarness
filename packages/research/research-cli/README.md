# @deepseek-ai/dsh-research-cli

English | [中文](README.zh.md)

`dsh-research` reads one `zj-research-cli/v1` JSON request from stdin and writes one versioned JSON response to stdout. `describe` reports compatible operations without external work, `collect` runs the commit-pinned Evidence Compiler, `compile-report` runs the shared Report Compiler, `render-html` validates a report family's final Markdown and derives offline HTML, and `evaluate` emits deterministic health from the same Report IR and sealed ledger. Diagnostics go to stderr and use a non-zero exit status; stdout remains machine-only.

The executable reads the optional `GITHUB_TOKEN` environment variable for canonical GitHub calls. `DEEPWIKI_MCP_URL` enables internal navigation and `DSH_RESEARCH_EXTERNAL_NAVIGATION_REPOSITORIES` supplies its comma-separated exact allowlist. Collect operations persist validated sealed ledgers under `$DSH_HOME/cache/research/v1` or `~/.dsh/cache/research/v1`; a corrupt entry fails the invocation. Callers must reject any other protocol version; the CLI does not silently fall back to Markdown-only generation.

## Model Experience

Indirectly, through skill or automation adapters. The executable contributes no model prompt or tool schema.

#### KV Cache effect

No direct invalidation; the calling adapter owns model-visible text.

## Known Limitations and Deferred Work

- The protocol returns compiled Markdown and derived HTML but does not write artifacts; each host retains its own authorized filesystem publication step.
