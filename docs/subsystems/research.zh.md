# 技术调研

[English](research.md) | 中文

技术调研子系统把规范化 brief 编译为固定 GitHub commit 的证据，以 sealed ledger 校验语义化报告，并从持久 session event 投影发布健康状态。[`dsh-research`](../../packages/research/research) 负责共享 compiler 约定，[`dsh-tool-research`](../../packages/research/tool-research) 向 agent 暴露有界采集，[`dsh-tool-research-report`](../../packages/research/tool-research-report) 校验并发布报告，[`dsh-research-cli`](../../packages/research/research-cli) 向 skill 与自动化暴露相同 compiler，[`dsh-research-eval`](../../packages/research/research-eval) 在不改变 compiler 语义的情况下比较这些编排路线。

DeepWiki 与 heuristic navigator 只生成候选路径。compiler 先用不可变仓库树验证这些路径，再读取对应 GitHub 文件，然后才能创建 canonical evidence；navigation 输出本身不能支撑 claim。

源码：[`packages/research/research/src/types.ts`](../../packages/research/research/src/types.ts) 与 [`packages/research/research/src/health.ts`](../../packages/research/research/src/health.ts)

## Brief 与 evidence ledger

Brief 记录调研问题、显式对比准则、可选仓库与确定性 discovery 输入、policy version，以及完整运行的文件、字节和 deadline 预算。显式仓库与 discovery request 至少提供一项。候选选择把 GitHub stars 与任务相关的 topic match 保留为独立事实，然后在读取任何证据前固定每个仓库的 revision。Compiler 以确定性 fair share 分配剩余文件与字节容量，避免靠前仓库耗尽多仓库运行的预算。

```ts type-equiv
/** One normalized research question and the criteria used to answer it. */
interface ResearchBrief {
  readonly schema: 'zj-research-brief/v1'
  readonly topic: string
  readonly criteria: readonly ResearchCriterion[]
  readonly repositories: readonly GitHubRepositoryRef[]
  readonly discovery?: ResearchDiscoveryRequest
  readonly policyVersion: string
  readonly budget?: { readonly maxFiles?: number; readonly maxBytes?: number; readonly deadlineMs?: number }
}
```

Ledger 封存不可变仓库 revision、canonical excerpt、未覆盖准则、navigation 结果、候选评分事实，以及 compiler 测得的采集成本。`unknownCriteria` 记录证据覆盖缺口，不会断言仓库缺少该能力。文件、字节或 deadline 耗尽时停止后续 canonical read，并把剩余准则保留为 unknown。Cache identity 由规范化 brief、policy version 和固定 revision 共同构成。

```ts type-equiv
/** Immutable ledger emitted by the compiler; every critical criterion is covered or unknown. */
interface VerifiedEvidenceLedger {
  readonly schema: 'zj-verified-evidence-ledger/v1'
  readonly compilerVersion: 'research/v1'
  readonly briefFingerprint: string
  readonly policyVersion: string
  readonly observedAt: string
  readonly repositories: readonly RepositoryRevision[]
  readonly candidates: readonly ResearchRepositoryCandidate[]
  readonly evidence: readonly Evidence[]
  readonly unknownCriteria: readonly UnknownCriterion[]
  readonly navigation: readonly NavigationDiagnostic[]
  readonly collection: ResearchCollectionFacts
}
```

## Report IR 与发布

Report IR 是 technical-C4 与 skill-native 报告族共享的语义输入。校验会检查 Evidence → Claim → Comparison → Recommendation 引用、保留 ledger 所有的候选评分、要求 critical claim 具备证据，并要求每项 metric 都有可执行定义。technical-C4 报告族还要求 landscape diagram、detail diagram 和所有 sealed candidate。

```ts type-equiv
/** Semantic report input shared by technical-C4 and skill-native projections. */
interface ResearchReportIr {
  readonly schema: 'zj-research-report-ir/v1'
  readonly family: 'technical-c4/v1' | 'zj-draft/v1'
  readonly title: string
  readonly summary: string
  readonly ledgerFingerprint: string
  readonly concepts: readonly { readonly key: string; readonly value: string }[]
  readonly diagrams: readonly ResearchDiagram[]
  readonly candidates: readonly ResearchCandidate[]
  readonly cards: readonly ResearchCard[]
  readonly claims: readonly ResearchClaim[]
  readonly comparisons: readonly ResearchComparison[]
  readonly recommendations: readonly ResearchRecommendation[]
  readonly metrics: readonly ResearchMetric[]
}
```

Prepare 在不产生文件系统 effect 的情况下完成校验与编译，并返回 single-use token。Publish 通过 `ctx.fs` 创建权威 Markdown 和同名派生 HTML；目标已存在或 token 复用都会失败。HTML 写入失败时会保留已创建的 Markdown，并消耗该 token。

## 持久健康状态

报告 Consumer 追加 `research/report-prepared`、`research/report-published` 与 `research/evaluation-completed`。`researchHealth` session projection 统计校验尝试和发布次数，保留最近的应用回执与确定性 evaluation，并从持久 assistant message 累积互不重叠的模型 token 类别。

```ts type-equiv
/** Deterministic health result for one completed research publication. */
interface ResearchEvaluation {
  readonly reportHash: string
  readonly reportFamily: ResearchReportIr['family']
  readonly compilerVersion: VerifiedEvidenceLedger['compilerVersion']
  readonly healthy: boolean
  readonly correctness: ResearchCorrectness
  readonly evidenceCount: number
  readonly unknownCount: number
  readonly navigationFailureCount: number
  readonly collection: VerifiedEvidenceLedger['collection']
}
```

```ts type-equiv
/** Session read model for research validation, publication, and latest health. */
interface ResearchHealthProjection {
  readonly prepareAttempts: number
  readonly invalidPrepareAttempts: number
  readonly publishCount: number
  readonly latestReceipt: Omit<ResearchPublicationFacts, 'publishCount'> | null
  readonly modelUsage: ResearchModelUsage
  readonly latest: ResearchEvaluation | null
}
```

`healthy` 要求六项 correctness fact 全部成立：revision 已固定、证据 provenance 完整、critical claim 有证据、popularity 与 topic-match 轴独立、恰好发布一次，以及回执的 hash 与 artifact path 一致。OpenTelemetry 导出只使用 report family 与 compiler version 作为 attribute；仓库名、路径、prompt、source 和报告文本都不进入指标。效率基线在 30 次可比运行前保持 undefined，此后使用 median、p95、MAD 与 `p95 + 3 × MAD` warning threshold。

## 对比评测

`zj-research-experiment/v1` manifest 固定 corpus、compiler artifact hash、policy、model、Judge、report family、cache cohort、navigation 配置、重复次数和单次运行预算。受控 case 还会标识一个 sealed ledger，因此 Agent 与 skill arm 只在编排以及 prompt 或 skill 指令上不同。原生 case 将证据采集保留在各 arm 内，并作为独立 lane 报告。

三个不可追改资产约束质量 case：`zj-research-rubric-set/v1` 定义加权 criterion 和 Judge threshold，`zj-research-human-annotation-set/v1` 把每个 case 绑定到 evidence verdict 以及可接受的 recommendation fingerprint 或 abstention，`zj-research-judge-calibration-set/v1` 则为固定报告配对盲测 Judge 结果与人工评分。只有所有质量 case 都能跨资产解析，且校准通过样本数、评分误差、推荐一致率和遗漏风险限制，runtime 才接纳质量结果。

每次 run 向 experiment-owned log 追加一个 `research-eval/run-started` fact 和一个 terminal fact。Receipt 是这对 event 的确定性 projection，并分别保留 operational health、structural correctness、evidence quality 与 decision usefulness。Cohort reliability 统计每一个 start，包括 torn start-only log；语义与效率 baseline 至少需要 30 个通过结构硬门禁的成功报告。
