# @deepseek-ai/dsh-research-telemetry-otel

English | [中文](README.zh.md)

This opt-in Consumer listens for durable assistant usage and `research/evaluation-completed` events. It exports nine research-health and collection histograms plus five disjoint model-token histograms. Attributes are limited to report family and compiler version; repository names, source paths, prompts, and report text never become metric labels or values.

`url` is the full OTLP Metrics endpoint. `exportIntervalMillis` controls periodic export and defaults to 60 seconds; `timeoutMillis` bounds each OTLP request and defaults to 10 seconds. Plugin disposal awaits the Metrics SDK shutdown so queued points reach quiescence.

## Model Experience

None, as this package observes durable evaluation events after model-visible work is complete.

#### KV Cache effect

No direct invalidation; metric export does not change model requests or session history.

## Known Limitations and Deferred Work

- Efficiency thresholds remain unset until at least 30 comparable runs establish a baseline; this package exports raw bounded observations only.
