# research/ — Evidence compilation and technical research reports

English | [中文](README.zh.md)

This group contains the research contracts, canonical evidence compiler, and model-facing publisher used by technical solution research compositions.

| Package | Role | Registration |
|---|---|---|
| [`research/`](research/README.md) | Pins source revisions and compiles a versioned evidence ledger | library |
| [`research-report/`](research-report/README.md) | Validates report-family Markdown and derives deterministic offline HTML | library |
| [`research-cli/`](research-cli/README.md) | Exposes the shared compilers through a versioned stdin/stdout protocol | executable |
| [`research-telemetry-otel/`](research-telemetry-otel/README.md) | Exports low-cardinality health, efficiency, and model-cost metrics | listens to `session/event` |
| [`tool-research/`](tool-research/README.md) | Exposes one bounded multi-repository evidence compilation | registers on `ctx.tools` |
| [`tool-research-report/`](tool-research-report/README.md) | Validates authoritative research Markdown and derives offline HTML | registers on `ctx.tools` |

Research workflow policy belongs to the composition that selects these packages. The evidence compiler owns source provenance, candidate discovery, and unknown results; the report libraries own semantic compilation and HTML projection; the publisher owns filesystem effects; the telemetry Consumer observes only durable evaluation and usage facts.
