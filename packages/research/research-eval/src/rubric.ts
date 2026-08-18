/** Human rubric validation and blind-Judge calibration for research experiments. */
import { z } from 'zod'
import type {
  ResearchEvaluationAssetSummary,
  ResearchEvaluationRubricSet,
  ResearchExperimentManifest,
  ResearchHumanAnnotationSet,
  ResearchJudgeCalibrationResult,
  ResearchJudgeCalibrationSet,
  ResearchJudgeResult,
} from './types.ts'

const sha256 = z.string().regex(/^[a-f0-9]{64}$/)
const score = z.number().min(0).max(100)
const ratio = z.number().min(0).max(1)
const scenario = z.enum([
  'multi-repository-selection',
  'single-repository-deep-read',
  'insufficient-evidence',
  'conflicting-evidence',
  'navigation-degraded',
])

/** Runtime schema for Judge results crossing adapter and durable-file boundaries. */
export const researchJudgeResultSchema = z.object({
  evidenceQuality: z.object({
    criticalCoverage: score,
    entailment: score,
    unknownCorrectness: score,
    provenanceCompleteness: score,
  }),
  decisionUsefulness: z.object({
    rubricScore: score,
    recommendationAcceptable: z.boolean(),
    keyRisksOmitted: z.number().int().nonnegative(),
  }),
})

const rubricSetSchema = z.object({
  schema: z.literal('zj-research-rubric-set/v1'),
  version: z.string().min(1),
  corpusVersion: z.string().min(1),
  rubrics: z.array(z.object({
    id: z.string().min(1),
    scenario,
    criteria: z.array(z.object({
      id: z.string().min(1),
      description: z.string().min(1),
      weight: z.number().int().positive(),
    })).min(1),
  })).min(1),
  calibration: z.object({
    minimumSamples: z.number().int().positive(),
    scoreTolerance: score,
    maxMeanAbsoluteError: score,
    minWithinToleranceRate: ratio,
    minRecommendationAgreement: ratio,
    maxRiskCountMeanAbsoluteError: z.number().nonnegative(),
  }),
}).superRefine((value, context) => {
  if (new Set(value.rubrics.map(rubric => rubric.id)).size !== value.rubrics.length)
    context.addIssue({ code: 'custom', path: ['rubrics'], message: 'rubric ids must be unique' })
  for (const [rubricIndex, rubric] of value.rubrics.entries()) {
    if (new Set(rubric.criteria.map(criterion => criterion.id)).size !== rubric.criteria.length)
      context.addIssue({ code: 'custom', path: ['rubrics', rubricIndex, 'criteria'], message: 'rubric criterion ids must be unique' })
    if (rubric.criteria.reduce((total, criterion) => total + criterion.weight, 0) !== 100)
      context.addIssue({ code: 'custom', path: ['rubrics', rubricIndex, 'criteria'], message: 'rubric criterion weights must sum to 100' })
  }
  if (value.calibration.maxMeanAbsoluteError > value.calibration.scoreTolerance)
    context.addIssue({ code: 'custom', path: ['calibration'], message: 'calibration mean-error limit cannot exceed its per-score tolerance' })
})

const sourceSpanSchema = z.object({ evidenceId: z.string().min(1), quoteSha256: sha256 })
const annotationSetSchema = z.object({
  schema: z.literal('zj-research-human-annotation-set/v1'),
  version: z.string().min(1),
  corpusVersion: z.string().min(1),
  rubricSetVersion: z.string().min(1),
  cases: z.array(z.object({
    caseId: z.string().min(1),
    rubricVersion: z.string().min(1),
    evidence: z.array(z.object({
      criterionId: z.string().min(1),
      verdict: z.enum(['supported', 'unknown', 'conflicting']),
      sourceSpans: z.array(sourceSpanSchema),
    })).min(1),
    decision: z.object({
      requiredTradeoffIds: z.array(z.string().min(1)),
      requiredRiskIds: z.array(z.string().min(1)),
      acceptableRecommendationFingerprints: z.array(sha256),
      abstentionAcceptable: z.boolean(),
    }),
  })).min(1),
}).superRefine((value, context) => {
  if (new Set(value.cases.map(item => item.caseId)).size !== value.cases.length)
    context.addIssue({ code: 'custom', path: ['cases'], message: 'annotation case ids must be unique' })
  for (const [caseIndex, item] of value.cases.entries()) {
    if (new Set(item.evidence.map(expectation => expectation.criterionId)).size !== item.evidence.length)
      context.addIssue({ code: 'custom', path: ['cases', caseIndex, 'evidence'], message: 'annotation criterion ids must be unique' })
    for (const [expectationIndex, expectation] of item.evidence.entries()) {
      const requiresSources = expectation.verdict !== 'unknown'
      if (requiresSources === (expectation.sourceSpans.length === 0))
        context.addIssue({
          code: 'custom',
          path: ['cases', caseIndex, 'evidence', expectationIndex, 'sourceSpans'],
          message: requiresSources ? 'supported and conflicting expectations require source spans' : 'unknown expectations cannot cite source spans',
        })
    }
    if (!item.decision.abstentionAcceptable && item.decision.acceptableRecommendationFingerprints.length === 0)
      context.addIssue({ code: 'custom', path: ['cases', caseIndex, 'decision'], message: 'a case must accept abstention or at least one recommendation' })
  }
})

const calibrationSetSchema = z.object({
  schema: z.literal('zj-research-judge-calibration-set/v1'),
  version: z.string().min(1),
  corpusVersion: z.string().min(1),
  rubricSetVersion: z.string().min(1),
  judge: z.object({ id: z.string().min(1), promptVersion: z.string().min(1), configFingerprint: sha256 }),
  samples: z.array(z.object({
    caseId: z.string().min(1),
    reportHash: sha256,
    human: researchJudgeResultSchema,
    judge: researchJudgeResultSchema,
  })).min(1),
}).superRefine((value, context) => {
  if (new Set(value.samples.map(item => item.reportHash)).size !== value.samples.length)
    context.addIssue({ code: 'custom', path: ['samples'], message: 'calibration report hashes must be unique' })
})

/**
 * Parse one human-owned rubric set at a JSON boundary.
 * @param value - untrusted decoded JSON value.
 * @returns one validated immutable rubric set.
 */
export function parseResearchEvaluationRubricSet(value: unknown): ResearchEvaluationRubricSet {
  return rubricSetSchema.parse(value)
}

/**
 * Parse one human annotation set at a JSON boundary.
 * @param value - untrusted decoded JSON value.
 * @returns one validated case-truth set.
 */
export function parseResearchHumanAnnotationSet(value: unknown): ResearchHumanAnnotationSet {
  return annotationSetSchema.parse(value) as unknown as ResearchHumanAnnotationSet
}

/**
 * Parse one paired human/Judge calibration set at a JSON boundary.
 * @param value - untrusted decoded JSON value.
 * @returns one validated calibration sample set.
 */
export function parseResearchJudgeCalibrationSet(value: unknown): ResearchJudgeCalibrationSet {
  return calibrationSetSchema.parse(value) as unknown as ResearchJudgeCalibrationSet
}

/**
 * Parse one Judge result crossing an adapter or durable-file boundary.
 * @param value - untrusted adapter or decoded-file value.
 * @returns one bounded evidence and decision assessment.
 */
export function parseResearchJudgeResult(value: unknown): ResearchJudgeResult {
  return researchJudgeResultSchema.parse(value)
}

/**
 * Compare blind-Judge scores with paired human scores under the rubric policy.
 * @param rubricValue - rubric set containing immediate calibration thresholds.
 * @param calibrationValue - paired human and Judge scores for immutable reports.
 * @returns deterministic agreement facts and one policy verdict.
 */
export function calibrateResearchJudge(rubricValue: unknown, calibrationValue: unknown): ResearchJudgeCalibrationResult {
  const rubric = parseResearchEvaluationRubricSet(rubricValue)
  const calibration = parseResearchJudgeCalibrationSet(calibrationValue)
  if (calibration.corpusVersion !== rubric.corpusVersion) throw new Error('Judge calibration corpus version does not match the rubric set')
  if (calibration.rubricSetVersion !== rubric.version) throw new Error('Judge calibration rubric version does not match the rubric set')
  const scoreDifferences = calibration.samples.flatMap((sample) => {
    const humanScores = scoreValues(sample.human)
    const judgeScores = scoreValues(sample.judge)
    return [
      Math.abs(humanScores[0] - judgeScores[0]),
      Math.abs(humanScores[1] - judgeScores[1]),
      Math.abs(humanScores[2] - judgeScores[2]),
      Math.abs(humanScores[3] - judgeScores[3]),
      Math.abs(humanScores[4] - judgeScores[4]),
    ]
  })
  const scoreMeanAbsoluteError = mean(scoreDifferences)
  const scoresWithinTolerance = count(
    scoreDifferences,
    difference => difference <= rubric.calibration.scoreTolerance,
  )
  const withinToleranceRate = scoresWithinTolerance / scoreDifferences.length
  const recommendationAgreement = count(
    calibration.samples,
    sample => sample.human.decisionUsefulness.recommendationAcceptable === sample.judge.decisionUsefulness.recommendationAcceptable,
  ) / calibration.samples.length
  const riskCountMeanAbsoluteError = mean(calibration.samples.map(sample => Math.abs(
    sample.human.decisionUsefulness.keyRisksOmitted - sample.judge.decisionUsefulness.keyRisksOmitted,
  )))
  const passed = calibration.samples.length >= rubric.calibration.minimumSamples
    && scoreMeanAbsoluteError <= rubric.calibration.maxMeanAbsoluteError
    && withinToleranceRate >= rubric.calibration.minWithinToleranceRate
    && recommendationAgreement >= rubric.calibration.minRecommendationAgreement
    && riskCountMeanAbsoluteError <= rubric.calibration.maxRiskCountMeanAbsoluteError
  return {
    sampleCount: calibration.samples.length,
    scoreMeanAbsoluteError,
    withinToleranceRate,
    recommendationAgreement,
    riskCountMeanAbsoluteError,
    passed,
  }
}

/**
 * Cross-check one manifest and all human-owned evaluation assets before sampling.
 * @param manifest - parsed experiment manifest whose quality cases own the required coverage.
 * @param rubricValue - scenario rubrics referenced by quality cases.
 * @param annotationValue - human evidence and decision truth for quality cases.
 * @param calibrationValue - paired Judge calibration samples.
 * @returns version, coverage, and calibration facts when every asset agrees.
 */
export function validateResearchEvaluationAssets(
  manifest: ResearchExperimentManifest,
  rubricValue: unknown,
  annotationValue: unknown,
  calibrationValue: unknown,
): ResearchEvaluationAssetSummary {
  const rubricSet = parseResearchEvaluationRubricSet(rubricValue)
  const annotationSet = parseResearchHumanAnnotationSet(annotationValue)
  const calibrationSet = parseResearchJudgeCalibrationSet(calibrationValue)
  if (rubricSet.corpusVersion !== manifest.corpusVersion) throw new Error('rubric corpus version does not match the experiment manifest')
  if (annotationSet.corpusVersion !== manifest.corpusVersion) throw new Error('annotation corpus version does not match the experiment manifest')
  if (annotationSet.rubricSetVersion !== rubricSet.version) throw new Error('annotation rubric version does not match the rubric set')
  if (calibrationSet.judge.id !== manifest.judge.id
    || calibrationSet.judge.promptVersion !== manifest.judge.promptVersion
    || calibrationSet.judge.configFingerprint !== manifest.judge.configFingerprint)
    throw new Error('calibration Judge configuration does not match the experiment manifest')
  const qualityCases = manifest.cases.filter(item => item.purpose === 'quality')
  const qualityIds = new Set(qualityCases.map(item => item.id))
  if (annotationSet.cases.length !== qualityCases.length || annotationSet.cases.some(item => !qualityIds.has(item.caseId)))
    throw new Error('human annotations must cover every quality case exactly once')
  const rubricById = new Map(rubricSet.rubrics.map(rubric => [rubric.id, rubric]))
  for (const item of qualityCases) {
    const annotation = annotationSet.cases.find(candidate => candidate.caseId === item.id)
    if (annotation?.rubricVersion !== item.rubricVersion) throw new Error(`annotation rubric does not match quality case ${item.id}`)
    const rubric = rubricById.get(item.rubricVersion)
    if (rubric === undefined) throw new Error(`quality case references an unknown rubric: ${item.rubricVersion}`)
    if (rubric.scenario !== item.scenario) throw new Error(`rubric scenario does not match quality case ${item.id}`)
  }
  if (calibrationSet.samples.length !== qualityCases.length
    || new Set(calibrationSet.samples.map(item => item.caseId)).size !== qualityCases.length
    || calibrationSet.samples.some(item => !qualityIds.has(item.caseId)))
    throw new Error('Judge calibration must represent every quality case exactly once')
  const calibration = calibrateResearchJudge(rubricSet, calibrationSet)
  if (!calibration.passed) throw new Error('Judge calibration does not satisfy the rubric policy')
  return {
    corpusVersion: manifest.corpusVersion,
    rubricSetVersion: rubricSet.version,
    annotationSetVersion: annotationSet.version,
    calibrationSetVersion: calibrationSet.version,
    qualityCaseCount: qualityCases.length,
    calibration,
  }
}

function scoreValues(result: ResearchJudgeResult): readonly [number, number, number, number, number] {
  return [
    result.evidenceQuality.criticalCoverage,
    result.evidenceQuality.entailment,
    result.evidenceQuality.unknownCorrectness,
    result.evidenceQuality.provenanceCompleteness,
    result.decisionUsefulness.rubricScore,
  ]
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length
}

function count<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  return values.filter(predicate).length
}
