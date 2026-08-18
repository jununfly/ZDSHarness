# @deepseek-ai/dsh-research-report

English | [中文](README.zh.md)

This library validates authoritative research Markdown and derives deterministic single-file HTML. `technical-c4/v1` requires its ordered C4, Key-Value, comparison, metric, and source sections plus valid concept references. `zj-draft/v1` requires its ordered executive-summary, findings, synthesis, gaps, and source sections; its compiler emits ordinary inline citation links and a visible numbered source list so the Markdown and HTML preserve the same destinations. Both families reject unsupported link protocols and invalid Mermaid source.

The HTML projection uses pinned `marked` and Mermaid versions, escapes raw Markdown HTML, embeds the Mermaid runtime, and performs no filesystem effects. Callers retain Markdown as the source of truth and publish the returned HTML as a derivative artifact.

## Model Experience

Indirectly, through report Consumers and standalone adapters. This library contributes no model prompt or tool schema.

#### KV Cache effect

No direct invalidation; the calling Consumer owns model-visible text.

## Known Limitations and Deferred Work

- Reports containing Mermaid fences embed its runtime, increasing artifact size in exchange for offline rendering.
