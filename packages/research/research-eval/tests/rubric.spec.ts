import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  calibrateResearchJudge,
  parseResearchEvaluationRubricSet,
  parseResearchExperimentManifest,
  parseResearchHumanAnnotationSet,
  parseResearchJudgeCalibrationSet,
  validateResearchEvaluationAssets,
} from '@deepseek-ai/dsh-research-eval'
import { describe, expect, it } from 'vitest'

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(fileURLToPath(new URL(`fixtures/${name}`, import.meta.url)), 'utf8')) as unknown
}

describe('research evaluation rubrics', () => {
  it('rejects ambiguous rubric identities, weights, and calibration policy', async () => {
    const original = await fixture('controlled-quality-v1.rubrics.json') as {
      rubrics: { id: string; scenario: string; criteria: { id: string; weight: number }[] }[]
      calibration: { scoreTolerance: number; maxMeanAbsoluteError: number }
    }
    const rubrics = structuredClone(original)
    rubrics.rubrics[0]!.criteria[0]!.weight = 29
    expect(() => parseResearchEvaluationRubricSet(rubrics)).toThrow(/weights must sum to 100/)

    const duplicateRubric = structuredClone(original)
    duplicateRubric.rubrics[1]!.id = duplicateRubric.rubrics[0]!.id
    expect(() => parseResearchEvaluationRubricSet(duplicateRubric)).toThrow(/rubric ids must be unique/)

    const duplicateCriterion = structuredClone(original)
    duplicateCriterion.rubrics[0]!.criteria[1]!.id = duplicateCriterion.rubrics[0]!.criteria[0]!.id
    expect(() => parseResearchEvaluationRubricSet(duplicateCriterion)).toThrow(/criterion ids must be unique/)

    const contradictoryPolicy = structuredClone(original)
    contradictoryPolicy.calibration.maxMeanAbsoluteError = contradictoryPolicy.calibration.scoreTolerance + 1
    expect(() => parseResearchEvaluationRubricSet(contradictoryPolicy)).toThrow(/mean-error limit/)
  })

  it('rejects ambiguous human case and evidence truth', async () => {
    const original = await fixture('controlled-quality-v1.annotations.json') as {
      cases: {
        caseId: string
        evidence: { criterionId: string; verdict: string; sourceSpans: unknown[] }[]
        decision: { abstentionAcceptable: boolean; acceptableRecommendationFingerprints: string[] }
      }[]
    }
    const annotations = structuredClone(original)
    annotations.cases[0]!.evidence[0]!.verdict = 'unknown'
    expect(() => parseResearchHumanAnnotationSet(annotations)).toThrow(/unknown expectations cannot cite source spans/)

    const missingSource = structuredClone(original)
    missingSource.cases[0]!.evidence[0]!.sourceSpans = []
    expect(() => parseResearchHumanAnnotationSet(missingSource)).toThrow(/require source spans/)

    const duplicateCase = structuredClone(original)
    duplicateCase.cases[1]!.caseId = duplicateCase.cases[0]!.caseId
    expect(() => parseResearchHumanAnnotationSet(duplicateCase)).toThrow(/case ids must be unique/)

    const duplicateCriterion = structuredClone(original)
    duplicateCriterion.cases[0]!.evidence.push(structuredClone(duplicateCriterion.cases[0]!.evidence[0]!))
    expect(() => parseResearchHumanAnnotationSet(duplicateCriterion)).toThrow(/criterion ids must be unique/)

    const noDecision = structuredClone(original)
    noDecision.cases[0]!.decision.acceptableRecommendationFingerprints = []
    noDecision.cases[0]!.decision.abstentionAcceptable = false
    expect(() => parseResearchHumanAnnotationSet(noDecision)).toThrow(/accept abstention or at least one recommendation/)
  })

  it('rejects duplicate calibration reports and computes Judge agreement deterministically', async () => {
    const rubrics = await fixture('controlled-quality-v1.rubrics.json')
    const calibration = await fixture('controlled-quality-v1.calibration.json') as {
      samples: { reportHash: string; judge: { evidenceQuality: { entailment: number } } }[]
    }
    const result = calibrateResearchJudge(rubrics, calibration)
    expect(result).toEqual({
      sampleCount: 10,
      scoreMeanAbsoluteError: 2.4,
      withinToleranceRate: 1,
      recommendationAgreement: 1,
      riskCountMeanAbsoluteError: 0.1,
      passed: true,
    })

    calibration.samples[1]!.reportHash = calibration.samples[0]!.reportHash
    expect(() => parseResearchJudgeCalibrationSet(calibration)).toThrow(/report hashes must be unique/)
  })

  it('applies every Judge calibration threshold independently', async () => {
    const rubrics = await fixture('controlled-quality-v1.rubrics.json')
    const original = await fixture('controlled-quality-v1.calibration.json') as {
      corpusVersion: string
      rubricSetVersion: string
      samples: {
        human: {
          evidenceQuality: Record<string, number>
          decisionUsefulness: { rubricScore: number; recommendationAcceptable: boolean; keyRisksOmitted: number }
        }
        judge: {
          evidenceQuality: Record<string, number>
          decisionUsefulness: { rubricScore: number; recommendationAcceptable: boolean; keyRisksOmitted: number }
        }
      }[]
    }
    const tooSmall = structuredClone(original)
    tooSmall.samples.pop()
    expect(calibrateResearchJudge(rubrics, tooSmall).passed).toBe(false)

    const meanDrift = structuredClone(original)
    for (const sample of meanDrift.samples) sample.judge.evidenceQuality.entailment = 0
    expect(calibrateResearchJudge(rubrics, meanDrift).passed).toBe(false)

    const toleranceDrift = structuredClone(original)
    for (const sample of toleranceDrift.samples.slice(0, 2)) {
      for (const key of Object.keys(sample.human.evidenceQuality))
        sample.judge.evidenceQuality[key] = sample.human.evidenceQuality[key]! - 11
      sample.judge.decisionUsefulness.rubricScore = sample.human.decisionUsefulness.rubricScore - 11
    }
    toleranceDrift.samples[2]!.judge.evidenceQuality.entailment = toleranceDrift.samples[2]!.human.evidenceQuality.entailment! - 11
    const toleranceResult = calibrateResearchJudge(rubrics, toleranceDrift)
    expect(toleranceResult).toMatchObject({ withinToleranceRate: 0.78, passed: false })
    expect(toleranceResult.scoreMeanAbsoluteError).toBeLessThanOrEqual(5)

    const recommendationDrift = structuredClone(original)
    for (const sample of recommendationDrift.samples.slice(0, 2))
      sample.judge.decisionUsefulness.recommendationAcceptable = !sample.human.decisionUsefulness.recommendationAcceptable
    expect(calibrateResearchJudge(rubrics, recommendationDrift)).toMatchObject({ recommendationAgreement: 0.8, passed: false })

    const riskDrift = structuredClone(original)
    for (const sample of riskDrift.samples.slice(0, 3))
      sample.judge.decisionUsefulness.keyRisksOmitted = sample.human.decisionUsefulness.keyRisksOmitted + 1
    expect(calibrateResearchJudge(rubrics, riskDrift)).toMatchObject({ riskCountMeanAbsoluteError: 0.4, passed: false })

    const wrongCorpus = structuredClone(original)
    wrongCorpus.corpusVersion = 'other/v1'
    expect(() => calibrateResearchJudge(rubrics, wrongCorpus)).toThrow(/corpus version/)
    const wrongRubric = structuredClone(original)
    wrongRubric.rubricSetVersion = 'other/v1'
    expect(() => calibrateResearchJudge(rubrics, wrongRubric)).toThrow(/rubric version/)
  })

  it('fails closed when Judge drift or cross-asset coverage violates the frozen policy', async () => {
    const manifest = parseResearchExperimentManifest(await fixture('controlled-quality-v1.manifest.json'))
    const rubrics = await fixture('controlled-quality-v1.rubrics.json')
    const annotations = await fixture('controlled-quality-v1.annotations.json') as { cases: unknown[] }
    const calibration = await fixture('controlled-quality-v1.calibration.json') as {
      samples: { judge: { evidenceQuality: { entailment: number } } }[]
    }
    for (const sample of calibration.samples) sample.judge.evidenceQuality.entailment = 0
    expect(calibrateResearchJudge(rubrics, calibration).passed).toBe(false)
    expect(() => validateResearchEvaluationAssets(manifest, rubrics, annotations, calibration)).toThrow(/does not satisfy/)

    const validCalibration = await fixture('controlled-quality-v1.calibration.json')
    annotations.cases.pop()
    expect(() => validateResearchEvaluationAssets(manifest, rubrics, annotations, validCalibration)).toThrow(/cover every quality case/)
  })

  it('rejects every cross-asset version, Judge, rubric, and case mismatch', async () => {
    const manifest = parseResearchExperimentManifest(await fixture('controlled-quality-v1.manifest.json'))
    const rubrics = await fixture('controlled-quality-v1.rubrics.json') as {
      corpusVersion: string
      rubrics: { id: string; scenario: string }[]
    }
    const annotations = await fixture('controlled-quality-v1.annotations.json') as {
      corpusVersion: string
      rubricSetVersion: string
      cases: { caseId: string; rubricVersion: string }[]
    }
    const calibration = await fixture('controlled-quality-v1.calibration.json') as {
      judge: { id: string; promptVersion: string; configFingerprint: string }
      samples: { caseId: string; reportHash: string; judge: { decisionUsefulness: { rubricScore: number } } }[]
    }
    const expectInvalid = (
      mutate: (
        manifestValue: typeof manifest,
        rubricValue: typeof rubrics,
        annotationValue: typeof annotations,
        calibrationValue: typeof calibration,
      ) => void,
      message: RegExp,
    ) => {
      const manifestValue = structuredClone(manifest)
      const rubricValue = structuredClone(rubrics)
      const annotationValue = structuredClone(annotations)
      const calibrationValue = structuredClone(calibration)
      mutate(manifestValue, rubricValue, annotationValue, calibrationValue)
      expect(() => validateResearchEvaluationAssets(
        manifestValue,
        rubricValue,
        annotationValue,
        calibrationValue,
      )).toThrow(message)
    }

    expectInvalid((_manifest, value) => { value.corpusVersion = 'other/v1' }, /rubric corpus version/)
    expectInvalid((_manifest, _rubrics, value) => { value.corpusVersion = 'other/v1' }, /annotation corpus version/)
    expectInvalid((_manifest, _rubrics, value) => { value.rubricSetVersion = 'other/v1' }, /annotation rubric version/)
    expectInvalid((_manifest, _rubrics, _annotations, value) => { value.judge.id = 'other' }, /Judge configuration/)
    expectInvalid((_manifest, _rubrics, _annotations, value) => { value.judge.promptVersion = 'other/v1' }, /Judge configuration/)
    expectInvalid((_manifest, _rubrics, _annotations, value) => { value.judge.configFingerprint = 'd'.repeat(64) }, /Judge configuration/)
    expectInvalid((_manifest, _rubrics, value) => { value.cases[0]!.caseId = 'other' }, /cover every quality case/)
    expectInvalid((_manifest, _rubrics, value) => { value.cases[0]!.rubricVersion = 'other/v1' }, /annotation rubric/)
    expectInvalid((value, _rubrics, annotationValue) => {
      const mutable = value as unknown as { cases: { rubricVersion: string }[] }
      mutable.cases[0]!.rubricVersion = 'missing/v1'
      annotationValue.cases[0]!.rubricVersion = 'missing/v1'
    }, /unknown rubric/)
    expectInvalid((_manifest, value) => { value.rubrics[0]!.scenario = 'single-repository-deep-read' }, /rubric scenario/)
    expectInvalid((_manifest, _rubrics, _annotations, value) => { value.samples.pop() }, /every quality case exactly once/)
    expectInvalid((_manifest, _rubrics, _annotations, value) => {
      value.samples[1]!.caseId = value.samples[0]!.caseId
    }, /every quality case exactly once/)
    expectInvalid((_manifest, _rubrics, _annotations, value) => { value.samples[0]!.caseId = 'other' }, /every quality case exactly once/)
  })
})
