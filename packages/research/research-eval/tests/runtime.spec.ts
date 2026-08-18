import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  JsonlResearchExperimentEventSink,
  parseResearchExperimentManifest,
  projectResearchRunReceipt,
  readResearchExperimentEventLog,
  researchRunId,
  ResearchArmId,
  ResearchCaseId,
  ResearchExperimentId,
  ResearchExperimentRuntime,
  summarizeResearchCohort,
  type ResearchArmResult,
  type ResearchExperimentEvent,
  type ResearchExperimentManifest,
  type ResearchJudgeRequest,
} from '@deepseek-ai/dsh-research-eval'
import { describe, expect, it, vi } from 'vitest'

const HASH = 'a'.repeat(64)
const OTHER_HASH = 'b'.repeat(64)

function manifest(lane: 'controlled' | 'native' = 'controlled'): ResearchExperimentManifest {
  return {
    schema: 'zj-research-experiment/v1',
    id: ResearchExperimentId('experiment-v1'),
    lane,
    corpusVersion: 'corpus/v1',
    compiler: { version: 'research/v1', artifactSha256: HASH },
    policyVersion: 'policy/v1',
    model: { provider: 'fixture', id: 'model', configFingerprint: HASH },
    judge: { id: 'blind-judge', promptVersion: 'judge/v1', configFingerprint: HASH },
    reportFamily: 'technical-c4/v1',
    cacheCohort: 'cold',
    navigationFingerprint: HASH,
    repetitions: 3,
    budget: { maxDurationMs: 1_000, maxInputTokens: 100, maxOutputTokens: 100, maxSourceBytes: 1_000 },
    arms: [
      { id: ResearchArmId('agent'), adapter: 'agent-adapter' },
      { id: ResearchArmId('skill'), adapter: 'skill-adapter' },
    ],
    cases: [{
      id: ResearchCaseId('selection'),
      language: 'zh',
      purpose: 'quality',
      scenario: 'multi-repository-selection',
      briefFingerprint: HASH,
      rubricVersion: 'rubric/v1',
      ...(lane === 'controlled' ? { ledgerFingerprint: OTHER_HASH } : {}),
    }],
  }
}

function armResult(): ResearchArmResult {
  return {
    report: { hash: HASH, family: 'technical-c4/v1', recommendationFingerprint: OTHER_HASH },
    publication: { markdownPath: '/reports/report.md', htmlPath: '/reports/report.html', publishCount: 1 },
    structural: {
      revisionPinned: true,
      provenanceComplete: true,
      evidenceGraphComplete: true,
      scoringAxesSeparated: true,
      publishExactlyOnce: true,
      receiptConsistent: true,
    },
    collection: { filesRead: 3, sourceBytesRead: 500, cacheHit: false },
    usage: { inputTokens: 20, outputTokens: 30, reasoningTokens: 5 },
  }
}

function sink(events: ResearchExperimentEvent[]) {
  return { append: (event: ResearchExperimentEvent) => { events.push(event); return Promise.resolve() } }
}

describe('research experiment runtime', () => {
  it('requires controlled cases to identify one sealed ledger', () => {
    const invalid = structuredClone(manifest()) as ResearchExperimentManifest & { cases: { ledgerFingerprint?: string }[] }
    delete invalid.cases[0]?.ledgerFingerprint
    expect(() => parseResearchExperimentManifest(invalid)).toThrow(/sealed ledger fingerprint/)
    expect(parseResearchExperimentManifest(manifest('native')).lane).toBe('native')
  })

  it('rejects duplicate arm and case identities', () => {
    const original = manifest()
    const duplicateArms = { ...original, arms: [original.arms[0]!, { ...original.arms[1]!, id: original.arms[0]!.id }] }
    expect(() => parseResearchExperimentManifest(duplicateArms)).toThrow(/arm ids must be unique/)

    const duplicateCases = { ...original, cases: [original.cases[0]!, original.cases[0]!] }
    expect(() => parseResearchExperimentManifest(duplicateCases)).toThrow(/case ids must be unique/)
  })

  it('rejects selections and adapters that do not match the manifest', async () => {
    const runtime = new ResearchExperimentRuntime()
    const adapter = { id: 'agent-adapter', run: () => Promise.resolve(armResult()) }
    const judge = { id: 'blind-judge', evaluate: () => Promise.reject(new Error('unused')) }
    const eventSink = sink([])
    await expect(runtime.run(manifest(), { caseId: ResearchCaseId('missing'), armId: ResearchArmId('agent'), repetition: 1 }, adapter, judge, eventSink)).rejects.toThrow(/case not found/)
    await expect(runtime.run(manifest(), { caseId: ResearchCaseId('selection'), armId: ResearchArmId('missing'), repetition: 1 }, adapter, judge, eventSink)).rejects.toThrow(/arm not found/)
    await expect(runtime.run(manifest(), { caseId: ResearchCaseId('selection'), armId: ResearchArmId('agent'), repetition: 0 }, adapter, judge, eventSink)).rejects.toThrow(/repetition must be between/)
    await expect(runtime.run(manifest(), { caseId: ResearchCaseId('selection'), armId: ResearchArmId('agent'), repetition: 4 }, adapter, judge, eventSink)).rejects.toThrow(/repetition must be between/)
    await expect(runtime.run(manifest(), { caseId: ResearchCaseId('selection'), armId: ResearchArmId('agent'), repetition: 1 }, { ...adapter, id: 'wrong-arm' }, judge, eventSink)).rejects.toThrow(/requires adapter/)
    await expect(runtime.run(manifest(), { caseId: ResearchCaseId('selection'), armId: ResearchArmId('agent'), repetition: 1 }, adapter, { ...judge, id: 'wrong-judge' }, eventSink)).rejects.toThrow(/requires judge/)
  })

  it('durably records one start and one completion before returning a four-layer receipt', async () => {
    const events: ResearchExperimentEvent[] = []
    const judgeRequests: ResearchJudgeRequest[] = []
    const runtime = new ResearchExperimentRuntime(() => events.length === 0 ? 100 : 145)
    const receipt = await runtime.run(
      manifest(),
      { caseId: ResearchCaseId('selection'), armId: ResearchArmId('agent'), repetition: 1 },
      { id: 'agent-adapter', run: () => Promise.resolve(armResult()) },
      {
        id: 'blind-judge',
        evaluate: (request) => {
          judgeRequests.push(request)
          return Promise.resolve({
            evidenceQuality: { criticalCoverage: 100, entailment: 95, unknownCorrectness: 90, provenanceCompleteness: 100 },
            decisionUsefulness: { rubricScore: 92, keyRisksOmitted: 0 },
          })
        },
      },
      sink(events),
    )

    expect(events.map(event => event.type)).toEqual(['research-eval/run-started', 'research-eval/run-completed'])
    expect(judgeRequests[0]).not.toHaveProperty('armId')
    expect(receipt.health).toMatchObject({ hardGatePassed: true, overall: 'evaluated', operational: { outcome: 'completed', durationMs: 45 } })
    expect(receipt.report?.hash).toBe(HASH)
  })

  it('projects adapter, judge, cancellation, and budget failures as stable terminal receipts', async () => {
    const cases = [
      {
        expected: 'adapter-failure',
        arm: { id: 'agent-adapter', run: () => Promise.reject(new Error('provider detail')) },
        judge: { id: 'blind-judge', evaluate: () => Promise.reject(new Error('unused')) },
      },
      {
        expected: 'judge-failure',
        arm: { id: 'agent-adapter', run: () => Promise.resolve(armResult()) },
        judge: { id: 'blind-judge', evaluate: () => Promise.reject(new Error('judge detail')) },
      },
      {
        expected: 'resource-budget',
        arm: { id: 'agent-adapter', run: () => Promise.resolve({ ...armResult(), collection: { ...armResult().collection, sourceBytesRead: 2_000 } }) },
        judge: { id: 'blind-judge', evaluate: () => Promise.reject(new Error('unused')) },
      },
      {
        expected: 'resource-budget',
        arm: { id: 'agent-adapter', run: () => Promise.resolve({ ...armResult(), usage: { ...armResult().usage, inputTokens: 101 } }) },
        judge: { id: 'blind-judge', evaluate: () => Promise.reject(new Error('unused')) },
      },
      {
        expected: 'resource-budget',
        arm: { id: 'agent-adapter', run: () => Promise.resolve({ ...armResult(), usage: { ...armResult().usage, outputTokens: 101 } }) },
        judge: { id: 'blind-judge', evaluate: () => Promise.reject(new Error('unused')) },
      },
      {
        expected: 'adapter-failure',
        arm: { id: 'agent-adapter', run: () => Promise.resolve({ ...armResult(), report: { ...armResult().report, family: 'zj-draft/v1' as const } }) },
        judge: { id: 'blind-judge', evaluate: () => Promise.reject(new Error('unused')) },
      },
      {
        expected: 'adapter-failure',
        arm: { id: 'agent-adapter', run: () => Promise.resolve({ ...armResult(), report: { ...armResult().report, hash: 'invalid' } }) },
        judge: { id: 'blind-judge', evaluate: () => Promise.reject(new Error('unused')) },
      },
      {
        expected: 'judge-failure',
        arm: { id: 'agent-adapter', run: () => Promise.resolve(armResult()) },
        judge: { id: 'blind-judge', evaluate: () => Promise.resolve({ evidenceQuality: { criticalCoverage: 101, entailment: 100, unknownCorrectness: 100, provenanceCompleteness: 100 }, decisionUsefulness: { rubricScore: 100, keyRisksOmitted: 0 } }) },
      },
      {
        expected: 'judge-failure',
        arm: { id: 'agent-adapter', run: () => Promise.resolve(armResult()) },
        judge: { id: 'blind-judge', evaluate: () => Promise.resolve({ evidenceQuality: { criticalCoverage: 100, entailment: 100, unknownCorrectness: 100, provenanceCompleteness: 100 }, decisionUsefulness: { rubricScore: 100, keyRisksOmitted: -1 } }) },
      },
    ] as const
    for (const item of cases) {
      const events: ResearchExperimentEvent[] = []
      const receipt = await new ResearchExperimentRuntime().run(
        manifest(),
        { caseId: ResearchCaseId('selection'), armId: ResearchArmId('agent'), repetition: 1 },
        item.arm,
        item.judge,
        sink(events),
      )
      expect(receipt.health.operational.failureClass).toBe(item.expected)
      expect(events).toHaveLength(2)
    }

    const cancelledEvents: ResearchExperimentEvent[] = []
    const controller = new AbortController()
    controller.abort('caller cancelled')
    const cancelled = await new ResearchExperimentRuntime().run(
      manifest(),
      { caseId: ResearchCaseId('selection'), armId: ResearchArmId('agent'), repetition: 1 },
      { id: 'agent-adapter', run: () => new Promise(() => {}) },
      { id: 'blind-judge', evaluate: () => Promise.reject(new Error('unused')) },
      sink(cancelledEvents),
      controller.signal,
    )
    expect(cancelled.health.operational).toMatchObject({ outcome: 'cancelled', failureClass: 'cancelled' })
  })

  it('terminates an adapter that does not settle when the duration budget expires', async () => {
    vi.useFakeTimers()
    try {
      const events: ResearchExperimentEvent[] = []
      const running = new ResearchExperimentRuntime().run(
        { ...manifest(), budget: { ...manifest().budget, maxDurationMs: 10 } },
        { caseId: ResearchCaseId('selection'), armId: ResearchArmId('agent'), repetition: 1 },
        {
          id: 'agent-adapter',
          run: (_request, signal) => new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => { reject(new Error('adapter observed abort')) }, { once: true })
          }),
        },
        { id: 'blind-judge', evaluate: () => Promise.reject(new Error('unused')) },
        sink(events),
      )
      await vi.advanceTimersByTimeAsync(10)
      await expect(running).resolves.toMatchObject({ health: { operational: { outcome: 'budget-exhausted', failureClass: 'duration-budget' } } })
    } finally {
      vi.useRealTimers()
    }
  })

  it('round-trips the exact two-event lifecycle through the JSONL sink', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-research-eval-'))
    const path = join(directory, 'run.jsonl')
    try {
      const runtime = new ResearchExperimentRuntime()
      const receipt = await runtime.run(
        manifest(),
        { caseId: ResearchCaseId('selection'), armId: ResearchArmId('agent'), repetition: 1 },
        { id: 'agent-adapter', run: () => Promise.resolve(armResult()) },
        { id: 'blind-judge', evaluate: () => Promise.resolve({ evidenceQuality: { criticalCoverage: 100, entailment: 100, unknownCorrectness: 100, provenanceCompleteness: 100 }, decisionUsefulness: { rubricScore: 100, keyRisksOmitted: 0 } }) },
        new JsonlResearchExperimentEventSink(path),
      )
      const events = await readResearchExperimentEventLog(path)
      expect(projectResearchRunReceipt(events)).toEqual(receipt)
      await expect(new JsonlResearchExperimentEventSink(path).append(events[0]!)).rejects.toMatchObject({ code: 'EEXIST' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects incomplete, duplicate-terminal, or identity-changing event streams', () => {
    const experimentId = ResearchExperimentId('exp')
    const selection = { caseId: ResearchCaseId('case'), armId: ResearchArmId('arm'), repetition: 1 }
    const identity = { runId: researchRunId(experimentId, selection), experimentId, ...selection }
    const started: ResearchExperimentEvent = { schema: 'zj-research-experiment-event/v1', type: 'research-eval/run-started', seq: 1, time: 1, data: identity }
    const failed: ResearchExperimentEvent = { schema: 'zj-research-experiment-event/v1', type: 'research-eval/run-failed', seq: 2, time: 2, data: { ...identity, failureClass: 'adapter-failure' } }
    expect(() => projectResearchRunReceipt([started])).toThrow(/exactly one start and one terminal/)
    expect(() => projectResearchRunReceipt([started, failed, failed])).toThrow(/exactly one start and one terminal/)
    expect(() => projectResearchRunReceipt([started, started])).toThrow(/end with one terminal/)
    const changed: ResearchExperimentEvent = {
      schema: 'zj-research-experiment-event/v1',
      type: 'research-eval/run-failed',
      seq: 2,
      time: 2,
      data: { ...identity, runId: researchRunId(ResearchExperimentId('other'), selection), failureClass: 'adapter-failure' },
    }
    expect(() => projectResearchRunReceipt([started, changed])).toThrow(/identity changed/)
    expect(() => projectResearchRunReceipt([failed, failed])).toThrow(/begin with run-started/)
    expect(() => projectResearchRunReceipt([started, undefined] as never)).toThrow(/end with one terminal/)
    expect(() => projectResearchRunReceipt([{ ...started, time: 3 }, failed])).toThrow(/precedes its start/)
  })

  it('keeps structurally invalid completions out of evaluated quality', async () => {
    const events: ResearchExperimentEvent[] = []
    const result = { ...armResult(), structural: { ...armResult().structural, revisionPinned: false } }
    const receipt = await new ResearchExperimentRuntime().run(
      manifest(),
      { caseId: ResearchCaseId('selection'), armId: ResearchArmId('agent'), repetition: 1 },
      { id: 'agent-adapter', run: () => Promise.resolve(result) },
      { id: 'blind-judge', evaluate: () => Promise.resolve({ evidenceQuality: { criticalCoverage: 100, entailment: 100, unknownCorrectness: 100, provenanceCompleteness: 100 }, decisionUsefulness: { rubricScore: 100, keyRisksOmitted: 0 } }) },
      sink(events),
    )
    expect(receipt.health).toMatchObject({ hardGatePassed: false, overall: 'failed' })
  })

  it('uses all starts for reliability and waits for 30 valid reports before emitting a baseline', async () => {
    const successfulRuns: ResearchExperimentEvent[][] = []
    for (let repetition = 1; repetition <= 30; repetition += 1) {
      const events: ResearchExperimentEvent[] = []
      await new ResearchExperimentRuntime(() => repetition * 100).run(
        { ...manifest(), repetitions: 30 },
        { caseId: ResearchCaseId('selection'), armId: ResearchArmId('agent'), repetition },
        { id: 'agent-adapter', run: () => Promise.resolve(armResult()) },
        { id: 'blind-judge', evaluate: () => Promise.resolve({ evidenceQuality: { criticalCoverage: 100, entailment: 95, unknownCorrectness: 90, provenanceCompleteness: 100 }, decisionUsefulness: { rubricScore: 92, keyRisksOmitted: 0 } }) },
        sink(events),
      )
      successfulRuns.push(events)
    }
    const torn = [successfulRuns[0]![0]!]
    const beforeFloor = summarizeResearchCohort([...successfulRuns.slice(0, 29), torn])
    expect(beforeFloor).toMatchObject({
      startedCount: 30,
      terminalCount: 29,
      terminalCompleteness: 29 / 30,
      qualitySampleCount: 29,
      baseline: null,
      outcomes: { incomplete: 1 },
    })

    const baseline = summarizeResearchCohort(successfulRuns)
    expect(baseline).toMatchObject({
      startedCount: 30,
      terminalCount: 30,
      qualitySampleCount: 30,
      baseline: {
        sampleCount: 30,
        sourceBytesRead: { median: 500 },
        totalTokens: { median: 50 },
        entailment: { median: 95 },
        rubricScore: { median: 92 },
      },
    })
    expect(summarizeResearchCohort([...successfulRuns, successfulRuns[0]!]).baseline?.sampleCount).toBe(31)

    const failed = successfulRuns[0]!.map(event => event.type === 'research-eval/run-completed'
      ? { ...event, type: 'research-eval/run-failed' as const, data: { ...event.data, failureClass: 'adapter-failure' as const } }
      : event) as ResearchExperimentEvent[]
    expect(summarizeResearchCohort([failed])).toMatchObject({ failureClasses: { 'adapter-failure': 1 }, qualitySampleCount: 0 })
    expect(summarizeResearchCohort([])).toMatchObject({ terminalCompleteness: 1, hardGatePassRate: 1 })
    expect(() => summarizeResearchCohort([[]])).toThrow(/without run-started/)
  })
})
