# Technical Research

English | [中文](research.zh.md)

The technical research subsystem compiles a normalized brief into commit-pinned GitHub evidence, validates a semantic report against that sealed ledger, and projects publication health from durable session events. [`dsh-research`](../../packages/research/research) owns the shared compiler contracts, [`dsh-tool-research`](../../packages/research/tool-research) exposes bounded collection to an agent, [`dsh-tool-research-report`](../../packages/research/tool-research-report) validates and publishes reports, and [`dsh-research-cli`](../../packages/research/research-cli) exposes the same compilers to skills and automation.

DeepWiki and heuristic navigators produce candidate paths only. The compiler verifies those paths against an immutable repository tree and reads the corresponding GitHub files before creating canonical evidence; navigation output cannot support a claim by itself.

Source: [`packages/research/research/src/types.ts`](../../packages/research/research/src/types.ts) and [`packages/research/research/src/health.ts`](../../packages/research/research/src/health.ts)

## Brief and evidence ledger

A brief names the research question, explicit comparison criteria, optional repositories and deterministic discovery input, policy version, and complete-run file, byte, and deadline budgets. At least one explicit repository or discovery request is required. Candidate selection retains GitHub stars and task-specific topic match as separate facts, then pins every repository before any evidence read. The compiler allocates remaining file and byte capacity by deterministic fair share so an earlier repository cannot exhaust a multi-repository run.

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

The ledger seals immutable repository revisions, canonical excerpts, uncovered criteria, navigation outcomes, candidate scoring facts, and compiler-measured collection cost. `unknownCriteria` records missing coverage without asserting that a repository lacks the capability. File, byte, and deadline exhaustion stop further canonical reads and leave remaining criteria unknown. Cache identity combines the normalized brief, policy version, and pinned revisions.

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

## Report IR and publication

Report IR is the semantic input shared by the technical-C4 and skill-native report families. Validation checks the Evidence → Claim → Comparison → Recommendation references, preserves ledger-owned candidate scores, requires evidence for critical claims, and requires operational definitions for every metric. The technical-C4 family also requires a landscape diagram, a detail diagram, and every sealed candidate.

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

Prepare performs validation and compilation without filesystem effects and returns a single-use token. Publish creates authoritative Markdown and derived same-name HTML through `ctx.fs`; existing targets and token reuse fail. A failed HTML write preserves the already-created Markdown and consumes the token.

## Durable health

The report Consumer appends `research/report-prepared`, `research/report-published`, and `research/evaluation-completed`. The `researchHealth` session projection counts validation attempts and publications, retains the latest application receipt and deterministic evaluation, and accumulates disjoint model token categories from durable assistant messages.

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

`healthy` requires all six correctness facts: pinned revisions, complete evidence provenance, evidence for critical claims, separated popularity and topic-match axes, exactly one publication, and a receipt whose hash and artifact paths are consistent. OpenTelemetry export uses only report family and compiler version as attributes; repository names, paths, prompts, sources, and report text remain excluded. Efficiency baselines remain undefined before 30 comparable runs and then use median, p95, MAD, and `p95 + 3 × MAD` warning thresholds.
