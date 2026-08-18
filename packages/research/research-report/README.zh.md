# @deepseek-ai/dsh-research-report

[English](README.md) | 中文

本 library 校验权威调研 Markdown，并派生确定性的单文件 HTML。`technical-c4/v1` 要求有序的 C4、Key-Value、对比、指标与来源章节及有效的概念引用。`zj-draft/v1` 要求有序的执行摘要、发现、综合分析、信息缺口与来源章节；其 compiler 输出普通内联引用与可见的编号来源清单，使 Markdown 与 HTML 保留相同目标。两个 family 都拒绝不支持的链接 protocol 与无效 Mermaid source。

HTML 投影使用固定版本的 `marked` 与 Mermaid，转义 Markdown 中的 raw HTML，内嵌 Mermaid runtime，且不产生文件系统 effect。调用方保持 Markdown 为事实源，并把返回的 HTML 作为派生产物发布。

## 模型体验

通过报告 Consumer 与 standalone adapter 间接产生。本 library 不贡献模型 prompt 或 tool schema。

#### KV Cache 影响

不直接失效；调用方 Consumer 负责模型可见文本。

## 已知限制与延后工作

- 包含 Mermaid fence 的报告会内嵌其 runtime，以更大的产物体积换取离线渲染。
