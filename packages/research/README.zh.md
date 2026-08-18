# research/ — 证据编译与技术调研报告

[English](README.md) | 中文

本组包含技术方案调研组合使用的研究契约、canonical evidence compiler 与面向模型发布器。

| 包 | 角色 | 注册位置 |
|---|---|---|
| [`research/`](research/README.md) | 固定 source revision 并编译 versioned evidence ledger | library |
| [`research-report/`](research-report/README.md) | 校验报告 family Markdown 并派生确定性离线 HTML | library |
| [`research-cli/`](research-cli/README.md) | 通过 versioned stdin/stdout protocol 暴露共享 compiler | executable |
| [`research-telemetry-otel/`](research-telemetry-otel/README.md) | 导出低基数健康、效率与模型成本指标 | 监听 `session/event` |
| [`tool-research/`](tool-research/README.md) | 暴露一次有界多仓库 evidence compilation | 注册到 `ctx.tools` |
| [`tool-research-report/`](tool-research-report/README.md) | 校验权威调研 Markdown 并派生离线 HTML | 注册到 `ctx.tools` |

调研工作流策略属于选择这些包的组合。evidence compiler 负责来源追踪、候选发现与 unknown 结果；report library 负责语义编译与 HTML 投影；publisher 负责文件系统 effect；telemetry Consumer 只观察 durable evaluation 与 usage fact。
