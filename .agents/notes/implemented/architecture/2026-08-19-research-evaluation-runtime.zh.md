# Agent Note: 调研评测 runtime

Status: implemented

[English](2026-08-19-research-evaluation-runtime.md) | 中文

## Problem

发布健康可以证明报告及其引用在结构上一致，但不能证明证据能够蕴含 claim，也不能证明 recommendation 能帮助团队决策。只观察成功结果的 telemetry 还会遗漏发布前失败的 run。用分别生成的 brief 或 revision 比较 Agent 与 skill 编排，会把编排质量与证据漂移混在一起。

## Decision

`@deepseek-ai/dsh-research-eval` 在 Evidence Compiler 与 Report Compiler 之外负责对比评测。版本化 experiment manifest 固定 compiler artifact、policy、model、Judge、report family、cache cohort、navigation 配置、预算、corpus case、arm 和重复次数。受控 case 必须共享 sealed-ledger fingerprint；原生 case 保持独立 lane。

Runtime 通过一个 `run()` interface 接收注入的 arm 与盲测 Judge adapter。它在外部工作前追加 start fact，并在返回前追加且仅追加一个 terminal fact。Receipt 从 append-only event pair 派生，保留四个独立层次：operational health、structural correctness、evidence quality 与 decision usefulness。Cohort reliability 以每一个 start 为分母；语义与效率 baseline 则需要 30 个通过结构硬门禁的成功报告。

共享 compiler 保持唯一，但编排路线不必只有一种实现。Agent 可以成为团队默认入口，同时 skill 可以为不同工作流继续存在。只有评测与使用数据都表明某条路线没有独立价值时，才会退役它。

## Alternatives considered

**扩展 `dsh-research`。** Compiler 随之需要负责 experiment arm、model 配置、重复运行与 Judge policy。这些关注点与证据和报告语义独立演化，扩大的 interface 会降低 locality，并迫使 skill consumer 继承评测机制。

**在 ZAgentic 中保留跨仓脚本。** 脚本能够启动对比，但不能让所有 host 共享同一套 manifest 校验、生命周期失败分类与 receipt projection。共享机制属于 compiler 同仓；ZAgentic 负责 skill 定义、rubric、manifest 与研究产物。

**使用单一加权分。** 总分会隐藏一条路线可靠性更高、另一条路线证据或决策更好的情况。结构硬门禁统一适用；其余维度保持 Pareto 对比，直到 deployment policy 明确优先级。

**只测量成功发布。** 这会产生幸存者偏差，因为 collection、model、Judge、取消与预算失败都会消失。Start-only log 会保留为不完整的 reliability outcome。

## Consequences

Experiment host 必须提供 durable event storage 以及显式 arm 与 Judge adapter。首个 standalone CLI 校验 manifest 并投影 receipt；production Agent 与 skill host 仍作为独立 adapter。原始 provider diagnostic 留在受控 log 或 Error cause 中，durable receipt 只保留稳定失败分类。

版本化 manifest 与不可变 receipt 让受控比较可复现，也保留原生路线差异。它们同时引入 artifact governance 责任：corpus 或 rubric 的语义变化会创建新版本，绝不并入已有 baseline。

## Verification

Package test 覆盖受控 manifest 不变量、盲测 Judge request、唯一 terminal fact、取消、duration 与 resource budget、adapter 与 Judge failure、JSONL durability、torn log、30 样本下限和真实 CLI process。
