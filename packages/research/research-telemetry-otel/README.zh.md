# @deepseek-ai/dsh-research-telemetry-otel

[English](README.md) | 中文

该可选 Consumer 监听 durable assistant usage 与 `research/evaluation-completed` 事件，通过 OTLP/HTTP 导出九个研究健康与采集 histogram，以及五个互不重叠的模型 token histogram。Attributes 只包含 report family 与 compiler version；仓库名、源码路径、prompt 和报告正文不会成为 metric label 或 value。

`url` 是完整 OTLP Metrics endpoint。`exportIntervalMillis` 控制定期导出，默认为 60 秒；`timeoutMillis` 限制每次 OTLP request，默认为 10 秒。Plugin dispose 会等待 Metrics SDK shutdown，使排队 point 达到 quiescence。

## Model Experience

无，因为本包只在模型可见工作完成后观察 durable evaluation event。

#### KV Cache effect

没有直接失效影响；metric export 不会改变模型请求或 session history。

## Known Limitations and Deferred Work

- 在至少 30 次可比较运行建立基线前，效率阈值保持未设置；本包只导出原始有界观测值。
