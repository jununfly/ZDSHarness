# @deepseek-ai/dsh-research-eval

[English](README.md) | 中文

用于比较技术调研编排路线的版本化实验 runtime，不修改 Evidence Compiler 或 Report Compiler。

`ResearchExperimentRuntime.run()` 接收一个 `zj-research-experiment/v1` manifest、case/arm/repetition selection、arm adapter、盲测 Judge adapter 和 durable event sink。受控 manifest 要求每个 case 提供一个 sealed-ledger fingerprint。Manifest 固定 compiler artifact、policy、model、Judge、report family、cache cohort、navigation 配置、重复次数和单次运行预算。

每个被接受的 run 会在调用 adapter 前追加一个 `zj-research-experiment-event/v2` start，并在返回前追加且仅追加一个 terminal event。`projectResearchRunReceipt()` 只接受一个 start 后紧跟一个 identity 一致的 terminal fact，并生成 `zj-research-run-receipt/v2`。它分别报告 operational、structural、evidence-quality 和 decision-usefulness 四层；`hardGatePassed` 只根据结构不变量派生，统计质量阈值仍由 baseline 管理。Judge 的决策事实包含 rubric score、recommendation 是否可接受以及遗漏风险数。

`summarizeResearchCohort()` 在可靠性统计中计算每一个 started log，包括只含 start 的 torn log，但质量与效率 baseline 只接纳完成且通过硬门禁的报告。Keyless fixture 将 10-case、每 case 三次重复的双语质量矩阵与注入的上游失败分开保存。Rubric set 定义各场景的加权标准和立即执行的 Judge 校准 policy；人工 annotation 记录证据支持状态、不可变 source-span hash、必需权衡与风险、可接受 recommendation 集合和是否允许 abstain。成对的人工/Judge 分数必须在采样前满足该 policy。

`JsonlResearchExperimentEventSink` 将每个 run 存入独占且仅 owner 可读的 JSONL 文件，并对每个 event 执行 fsync。第二次 start 会拒绝已有路径。只包含 start fact 的 torn log 不完整，不能投影 receipt。

`dsh-research-eval` CLI 从 stdin 接收一个 `zj-research-eval-cli/v1` request。`validate-manifest` 返回标准化 manifest；`validate-assets` 交叉校验 manifest、rubric、annotation、Judge 配置、case 覆盖与校准结果；`calibrate-judge` 返回确定性一致性事实；`project-receipt` 校验解码后的 event array，再返回 receipt。`describe` 在不运行 arm 的情况下报告支持的 schema。

## Model Experience

Indirectly, through experiment arm and Judge adapters that own any model-visible requests.

#### KV Cache effect

不会直接导致失效；每个 adapter 负责自身 request 构造与 cache 行为，manifest 记录选定的配置 fingerprint。

## Known Limitations and Deferred Work

- **没有 production arm host** — runtime 接受注入的 Agent 和 skill adapter，但 standalone CLI 不会启动 arm。
- **没有冻结 cohort 阈值** — Judge 校准 policy 立即生效；在每个可比 cohort 至少获得 30 个成功报告样本前，仍不定义效率与语义分数 SLO。
