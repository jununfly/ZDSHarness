# @deepseek-ai/dsh-tool-research-report

English | [中文](README.zh.md)

This Consumer registers `prepare_research_report(report, outputPath)` and `publish_research_report(validationToken)`. Prepare reads the latest `research/evidence-collected` ledger from the calling agent's durable session, compiles complete Report IR into authoritative Markdown, validates its sealed evidence links and derived HTML without filesystem effects, and returns structured diagnostics or a single-use token. Publish accepts only that token and writes the Markdown plus same-name offline HTML through `ctx.fs`.

## Publication contract

`outputPath` must end in `.md`. Prepare validates Evidence → Claim → Comparison → Recommendation references, requires canonical evidence for every critical claim, verifies candidate stars and topic match against the ledger, checks metric definitions, compiles the required section order, and validates Key references, link protocols, and every Mermaid fence. Publish refuses an existing Markdown or HTML target and uses create-if-absent writes to reject publication races. A token enters `publishing` before filesystem I/O and ends in `published` or `failed`; every later use raises `RESEARCH_REPORT_TOKEN_CONSUMED`.

The technical-C4 projection emits the top-level subjects `调研主题`, `输入材料与观察时间`, `Key-Value 概念索引`, `C4 System Landscape`, `候选项目表`, `深读项目卡片`, `方案族及适用场景对比`, `C4 Context/Container 与子主题图`, `关键技术指标矩阵`, `建议、限制与待验证事项`, and `来源清单` in that order. Concept definitions use the literal form `` - Key: `identifier` `` and the compiler emits their references.

The shared [`dsh-research-report`](../research-report) library derives HTML with pinned `marked` and Mermaid versions. Raw Markdown HTML is escaped, links allow only HTTP, HTTPS, mailto, and relative targets, and Mermaid runs with strict security. If the HTML write fails after Markdown succeeds, `ResearchReportError` uses `RESEARCH_REPORT_HTML_WRITE_FAILED` and identifies the preserved canonical Markdown path.

## Model Experience

### Publication guidance and tool schema

#### What the model sees

Every request in this plugin's scope tells the model to submit complete Report IR once, correct prepare diagnostics, publish one validated token, and leave execution facts to the application. The model sees the generated [`prepare_research_report` and `publish_research_report` schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tool-research-report).

#### Token effect

The prompt and schemas add a fixed request-prefix cost. The prepare call retains Report IR and its ledger until compaction; publish retains only a token.

#### KV Cache effect

Prefix-stable while the plugin, prompt text, and schema remain unchanged; activation, disposal, or a scoped tool restriction may invalidate reuse from the first changed token.

### Publication result and errors

#### What the model sees

Prepare returns `status: "invalid"` with all independent diagnostics, or `status: "validated"` with the token and report hash. Publish returns canonical absolute paths and the same hash. Unknown and consumed tokens use `RESEARCH_REPORT_TOKEN_UNKNOWN` and `RESEARCH_REPORT_TOKEN_CONSUMED`; a post-Markdown HTML failure returns `RESEARCH_REPORT_HTML_WRITE_FAILED` and the preserved Markdown path.

#### Token effect

Prepare adds diagnostics or a small validation receipt; publish adds a small deterministic publication receipt.

#### KV Cache effect

Append-only; the result follows the reusable request prefix.

## Known Limitations and Deferred Work

- Publication is two create-if-absent writes, not a filesystem transaction; an HTML failure preserves the authoritative Markdown and permanently consumes the token.
