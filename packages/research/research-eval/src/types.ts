import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable experiment identity across arms and repetitions. */
export type ResearchExperimentId = Branded<'ResearchExperimentId'>
/** Stable case identity within one versioned corpus. */
export type ResearchCaseId = Branded<'ResearchCaseId'>
/** Stable orchestration-arm identity within one experiment. */
export type ResearchArmId = Branded<'ResearchArmId'>
/** Stable identity for one case, arm, and repetition. */
export type ResearchRunId = Branded<'ResearchRunId'>

/** Immutable experiment inputs shared by every run in one comparison. */
export interface ResearchExperimentManifest {
  readonly schema: 'zj-research-experiment/v1'
  readonly id: ResearchExperimentId
  readonly lane: 'controlled' | 'native'
  readonly corpusVersion: string
  readonly compiler: { readonly version: string; readonly artifactSha256: string }
  readonly policyVersion: string
  readonly model: { readonly provider: string; readonly id: string; readonly configFingerprint: string }
  readonly judge: { readonly id: string; readonly promptVersion: string; readonly configFingerprint: string }
  readonly reportFamily: 'technical-c4/v1' | 'zj-draft/v1'
  readonly cacheCohort: 'cold' | 'warm'
  readonly navigationFingerprint: string
  readonly repetitions: number
  readonly budget: ResearchExperimentBudget
  readonly arms: readonly ResearchExperimentArm[]
  readonly cases: readonly ResearchExperimentCase[]
}

/** Hard per-run resource limits enforced by the experiment runtime. */
export interface ResearchExperimentBudget {
  readonly maxDurationMs: number
  readonly maxInputTokens: number
  readonly maxOutputTokens: number
  readonly maxSourceBytes: number
}

/** One orchestration route under comparison. */
export interface ResearchExperimentArm {
  readonly id: ResearchArmId
  readonly adapter: string
}

/** One versioned corpus case and its immutable research inputs. */
export interface ResearchExperimentCase {
  readonly id: ResearchCaseId
  readonly language: 'en' | 'zh'
  readonly purpose: 'quality' | 'reliability'
  readonly scenario:
    | 'multi-repository-selection'
    | 'single-repository-deep-read'
    | 'insufficient-evidence'
    | 'conflicting-evidence'
    | 'navigation-degraded'
    | 'upstream-failure'
  readonly briefFingerprint: string
  readonly ledgerFingerprint?: string
  readonly rubricVersion: string
}

/** One concrete run selected from a manifest. */
export interface ResearchRunSelection {
  readonly caseId: ResearchCaseId
  readonly armId: ResearchArmId
  readonly repetition: number
}

/** Model and collection facts returned by an orchestration adapter. */
export interface ResearchArmResult {
  readonly report: {
    readonly hash: string
    readonly family: ResearchExperimentManifest['reportFamily']
    readonly recommendationFingerprint: string
  }
  readonly publication: {
    readonly markdownPath: string
    readonly htmlPath: string
    readonly publishCount: number
  }
  readonly structural: ResearchStructuralCorrectness
  readonly collection: {
    readonly filesRead: number
    readonly sourceBytesRead: number
    readonly cacheHit: boolean
  }
  readonly usage: {
    readonly inputTokens: number
    readonly outputTokens: number
    readonly reasoningTokens: number
  }
}

/** Hard report and publication invariants owned by application code. */
export interface ResearchStructuralCorrectness {
  readonly revisionPinned: boolean
  readonly provenanceComplete: boolean
  readonly evidenceGraphComplete: boolean
  readonly scoringAxesSeparated: boolean
  readonly publishExactlyOnce: boolean
  readonly receiptConsistent: boolean
}

/** Arm implementation selected by the experiment host. */
export interface ResearchArmAdapter {
  readonly id: string
  /** @returns one completed report result or rejects with an adapter failure. */
  run(request: ResearchArmRequest, signal: AbortSignal): Promise<ResearchArmResult>
}

/** Inputs visible to one arm, including its identity and locked experiment facts. */
export interface ResearchArmRequest {
  readonly runId: ResearchRunId
  readonly manifest: ResearchExperimentManifest
  readonly case: ResearchExperimentCase
  readonly arm: ResearchExperimentArm
  readonly repetition: number
}

/** Judge input deliberately excludes arm identity. */
export interface ResearchJudgeRequest {
  readonly experimentId: ResearchExperimentId
  readonly caseId: ResearchCaseId
  readonly rubricVersion: string
  readonly reportHash: string
  readonly recommendationFingerprint: string
  readonly structural: ResearchStructuralCorrectness
}

/** Independent semantic assessment for one successful report. */
export interface ResearchJudgeResult {
  readonly evidenceQuality: {
    readonly criticalCoverage: number
    readonly entailment: number
    readonly unknownCorrectness: number
    readonly provenanceCompleteness: number
  }
  readonly decisionUsefulness: {
    readonly rubricScore: number
    readonly recommendationAcceptable: boolean
    readonly keyRisksOmitted: number
  }
}

/** Human-owned scoring rules shared by one immutable corpus version. */
export interface ResearchEvaluationRubricSet {
  readonly schema: 'zj-research-rubric-set/v1'
  readonly version: string
  readonly corpusVersion: string
  readonly rubrics: readonly ResearchEvaluationRubric[]
  readonly calibration: ResearchJudgeCalibrationPolicy
}

/** One scenario-specific decision-usefulness rubric. */
export interface ResearchEvaluationRubric {
  readonly id: string
  readonly scenario: Exclude<ResearchExperimentCase['scenario'], 'upstream-failure'>
  readonly criteria: readonly ResearchEvaluationRubricCriterion[]
}

/** Weighted human criterion scored on a zero-to-four ordinal scale. */
export interface ResearchEvaluationRubricCriterion {
  readonly id: string
  readonly description: string
  readonly weight: number
}

/** Immediate Judge calibration thresholds that precede statistical cohort SLOs. */
export interface ResearchJudgeCalibrationPolicy {
  readonly minimumSamples: number
  readonly scoreTolerance: number
  readonly maxMeanAbsoluteError: number
  readonly minWithinToleranceRate: number
  readonly minRecommendationAgreement: number
  readonly maxRiskCountMeanAbsoluteError: number
}

/** Human-maintained evidence and decision truth for every quality case. */
export interface ResearchHumanAnnotationSet {
  readonly schema: 'zj-research-human-annotation-set/v1'
  readonly version: string
  readonly corpusVersion: string
  readonly rubricSetVersion: string
  readonly cases: readonly ResearchHumanCaseAnnotation[]
}

/** Human truth for one case without prescribing a unique recommendation. */
export interface ResearchHumanCaseAnnotation {
  readonly caseId: ResearchCaseId
  readonly rubricVersion: string
  readonly evidence: readonly ResearchHumanEvidenceExpectation[]
  readonly decision: {
    readonly requiredTradeoffIds: readonly string[]
    readonly requiredRiskIds: readonly string[]
    readonly acceptableRecommendationFingerprints: readonly string[]
    readonly abstentionAcceptable: boolean
  }
}

/** Expected support state and canonical spans for one research criterion. */
export interface ResearchHumanEvidenceExpectation {
  readonly criterionId: string
  readonly verdict: 'supported' | 'unknown' | 'conflicting'
  readonly sourceSpans: readonly ResearchHumanSourceSpan[]
}

/** Immutable reference to one human-verified excerpt in a sealed ledger. */
export interface ResearchHumanSourceSpan {
  readonly evidenceId: string
  readonly quoteSha256: string
}

/** Paired human and blind-Judge scores used only for Judge calibration. */
export interface ResearchJudgeCalibrationSet {
  readonly schema: 'zj-research-judge-calibration-set/v1'
  readonly version: string
  readonly corpusVersion: string
  readonly rubricSetVersion: string
  readonly judge: ResearchExperimentManifest['judge']
  readonly samples: readonly ResearchJudgeCalibrationSample[]
}

/** One report scored independently by a human and the configured Judge. */
export interface ResearchJudgeCalibrationSample {
  readonly caseId: ResearchCaseId
  readonly reportHash: string
  readonly human: ResearchJudgeResult
  readonly judge: ResearchJudgeResult
}

/** Deterministic Judge-to-human agreement facts and their policy verdict. */
export interface ResearchJudgeCalibrationResult {
  readonly sampleCount: number
  readonly scoreMeanAbsoluteError: number
  readonly withinToleranceRate: number
  readonly recommendationAgreement: number
  readonly riskCountMeanAbsoluteError: number
  readonly passed: boolean
}

/** Cross-validated versions and counts for one complete quality corpus. */
export interface ResearchEvaluationAssetSummary {
  readonly corpusVersion: string
  readonly rubricSetVersion: string
  readonly annotationSetVersion: string
  readonly calibrationSetVersion: string
  readonly qualityCaseCount: number
  readonly calibration: ResearchJudgeCalibrationResult
}

/** Blind semantic evaluator selected by the experiment host. */
export interface ResearchJudgeAdapter {
  readonly id: string
  /** @returns semantic scores without receiving the arm identity. */
  evaluate(request: ResearchJudgeRequest, signal: AbortSignal): Promise<ResearchJudgeResult>
}

/** Stable terminal classes retained by reliability baselines. */
export type ResearchRunOutcome = 'completed' | 'failed' | 'cancelled' | 'budget-exhausted'

/** Stable failure taxonomy without provider-specific messages. */
export type ResearchRunFailureClass =
  | 'adapter-failure'
  | 'judge-failure'
  | 'cancelled'
  | 'duration-budget'
  | 'resource-budget'

/** Append-only fact for one experiment run. */
export type ResearchExperimentEvent =
  | {
    readonly schema: 'zj-research-experiment-event/v2'
    readonly type: 'research-eval/run-started'
    readonly seq: 1
    readonly time: number
    readonly data: ResearchRunIdentity
  }
  | {
    readonly schema: 'zj-research-experiment-event/v2'
    readonly type: 'research-eval/run-completed'
    readonly seq: 2
    readonly time: number
    readonly data: ResearchRunIdentity & { readonly result: ResearchArmResult; readonly judge: ResearchJudgeResult }
  }
  | {
    readonly schema: 'zj-research-experiment-event/v2'
    readonly type: 'research-eval/run-failed' | 'research-eval/run-cancelled' | 'research-eval/run-budget-exhausted'
    readonly seq: 2
    readonly time: number
    readonly data: ResearchRunIdentity & { readonly failureClass: ResearchRunFailureClass }
  }

/** Stable run identity copied into every lifecycle fact. */
export interface ResearchRunIdentity {
  readonly runId: ResearchRunId
  readonly experimentId: ResearchExperimentId
  readonly caseId: ResearchCaseId
  readonly armId: ResearchArmId
  readonly repetition: number
}

/** Four independent health layers projected from durable lifecycle facts. */
export interface ResearchRunHealth {
  readonly operational: {
    readonly terminalComplete: boolean
    readonly outcome: ResearchRunOutcome
    readonly durationMs: number
    readonly failureClass?: ResearchRunFailureClass
  }
  readonly structural: ResearchStructuralCorrectness | null
  readonly evidence: ResearchJudgeResult['evidenceQuality'] | null
  readonly usefulness: ResearchJudgeResult['decisionUsefulness'] | null
  readonly hardGatePassed: boolean
  readonly overall: 'failed' | 'evaluated'
}

/** Immutable projection for one terminal run. */
export interface ResearchRunReceipt {
  readonly schema: 'zj-research-run-receipt/v2'
  readonly identity: ResearchRunIdentity
  readonly health: ResearchRunHealth
  readonly report: ResearchArmResult['report'] | null
  readonly publication: ResearchArmResult['publication'] | null
  readonly collection: ResearchArmResult['collection'] | null
  readonly usage: ResearchArmResult['usage'] | null
}

/** Durable event destination owned by the experiment host. */
export interface ResearchExperimentEventSink {
  /** Append one event durably before the runtime publishes derived state. */
  append(event: ResearchExperimentEvent): Promise<void>
}

/** Robust distribution summary for one numeric health axis. */
export interface ResearchCohortAxis {
  readonly median: number
  readonly p95: number
  readonly mad: number
  readonly warnAbove: number
}

/** Statistical baseline emitted only after 30 comparable successful reports. */
export interface ResearchCohortBaseline {
  readonly sampleCount: number
  readonly durationMs: ResearchCohortAxis
  readonly sourceBytesRead: ResearchCohortAxis
  readonly totalTokens: ResearchCohortAxis
  readonly entailment: ResearchCohortAxis
  readonly rubricScore: ResearchCohortAxis
}

/** Reliability and quality summary projected from complete and torn run logs. */
export interface ResearchCohortSummary {
  readonly startedCount: number
  readonly terminalCount: number
  readonly terminalCompleteness: number
  readonly outcomes: Readonly<Record<ResearchRunOutcome | 'incomplete', number>>
  readonly failureClasses: Partial<Record<ResearchRunFailureClass, number>>
  readonly hardGatePassRate: number
  readonly qualitySampleCount: number
  readonly baseline: ResearchCohortBaseline | null
}
