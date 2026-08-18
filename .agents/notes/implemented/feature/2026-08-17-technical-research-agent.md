# Agent Note: Technical solution research agent

Status: implemented

English | [中文](2026-08-17-technical-research-agent.zh.md)

## Problem

A technical solution research task needs more than generic web recall. The agent must discover relevant GitHub projects, separate star-ranked recall from task-specific relevance, preserve source time and evidence, connect concepts and architecture diagrams, define comparable technical metrics, and publish one result that remains useful to both agents and humans. A free-form response cannot enforce those evidence, structure, citation, and artifact guarantees across JSON-RPC and ACP entry points.

## Decision

The runnable composition in [`examples/tech-research-agent`](../../../../examples/tech-research-agent) combines one shared research policy with three plugin responsibilities.

[`dsh-github`](../../../../packages/github/github) defines the provider-neutral `ctx.github` capability, and [`dsh-github-rest`](../../../../packages/github/github-rest) supplies github.com facts through REST. The research composition consumes that capability through the complete-brief compiler described in [research evidence and report compilers](2026-08-18-research-evidence-and-report-compilers.md); it does not mount the raw GitHub Consumer. The newer decision owns revision-pinned file reads, candidate scoring, evidence authority, Report IR, health, and skill reuse.

[`dsh-tool-research-report`](../../../../packages/research/tool-research-report) treats Markdown as the only report fact source and deterministically derives a same-name, single-file offline HTML projection. The publisher owns the required section order, Key definition/reference integrity, safe link protocols, Mermaid parsing, target conflicts, and create-if-absent writes. It embeds the pinned Mermaid runtime so the derived artifact renders without a network dependency. An HTML write failure preserves the already-written canonical Markdown and reports its path with `RESEARCH_REPORT_HTML_WRITE_FAILED`.

The JSON-RPC SDK and ACP configurations mount the same research policy, capability Consumers, publisher, and repeated-call reminder. The reminder tracks only identical `research_collect_evidence` arguments and injects escalating context at repetitions 2, 3, and 5 without replacing the original tool error. A `GITHUB_RATE_LIMITED` result cancels the current research turn after the result is preserved, so argument variation cannot convert one unchanged upstream window into repeated calls. The model catalog caps technical-research responses at 32,768 tokens; the policy submits Report IR directly instead of reproducing it in reasoning first. Transport-specific setup does not redefine scoring or report semantics.

## Alternatives considered

**Use generic web search for GitHub discovery.** Rejected because unstructured snippets do not provide a stable repository identity, raw star count, README state, or one timestamped error vocabulary. A dedicated capability keeps provider mechanics behind a small structured interface and leaves task-specific scoring to the composition.

**Generate HTML independently from the model.** Rejected because two authored reports can disagree. A deterministic projection preserves Markdown as the AI-readiness source of truth and makes HTML a human-readiness artifact.

**Publish Markdown first and validate only the HTML renderer.** Rejected because missing sections, broken Key references, unsupported links, or invalid Mermaid would become durable source defects. The publisher validates all package-owned invariants before either target is created.

**Create separate research policies for JSON-RPC and ACP.** Rejected because transport-specific prompts would make equivalent tasks produce different scoring and report obligations.

## Consequences

The model submits one complete brief and publishes a report whose Markdown and derived HTML paths are returned together. Keyless JSON-RPC snapshot coverage pins the complete collect → prepare → publish flow and exact artifacts; credential-gated e2e coverage exercises DeepSeek with live github.com; ACP e2e coverage drives the same composition through a real stdio connection. An unchanged GitHub rate-limit failure remains auditable and ends the turn deterministically; other identical-call loops retain advisory escalation.

The capability currently supports github.com only. Each HTML report carries the Mermaid runtime and is therefore materially larger than the Markdown source. Publication is intentionally not transactional across two files: a failure after the Markdown write leaves the authoritative artifact recoverable and reports its canonical path.
