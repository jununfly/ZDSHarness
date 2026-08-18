/** Versioned research experiment runtime and receipt projection. @module @deepseek-ai/dsh-research-eval */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type {
  ResearchArmAdapter,
  ResearchArmId as ResearchArmIdType,
  ResearchArmResult,
  ResearchCaseId as ResearchCaseIdType,
  ResearchCohortAxis,
  ResearchCohortBaseline,
  ResearchCohortSummary,
  ResearchExperimentEvent,
  ResearchExperimentEventSink,
  ResearchExperimentId as ResearchExperimentIdType,
  ResearchExperimentManifest,
  ResearchJudgeAdapter,
  ResearchJudgeResult,
  ResearchRunFailureClass,
  ResearchRunHealth,
  ResearchRunId,
  ResearchRunIdentity,
  ResearchRunReceipt,
  ResearchRunSelection,
} from './types.ts'

export * from './types.ts'
export * from './jsonl.ts'

const sha256 = z.string().regex(/^[a-f0-9]{64}$/)
const positiveInteger = z.number().int().positive()
const score = z.number().min(0).max(100)

const identitySchema = z.object({
  runId: z.string().min(1),
  experimentId: z.string().min(1),
  caseId: z.string().min(1),
  armId: z.string().min(1),
  repetition: positiveInteger,
})

const structuralSchema = z.object({
  revisionPinned: z.boolean(),
  provenanceComplete: z.boolean(),
  evidenceGraphComplete: z.boolean(),
  scoringAxesSeparated: z.boolean(),
  publishExactlyOnce: z.boolean(),
  receiptConsistent: z.boolean(),
})

const armResultSchema = z.object({
  report: z.object({ hash: sha256, family: z.enum(['technical-c4/v1', 'zj-draft/v1']), recommendationFingerprint: sha256 }),
  publication: z.object({ markdownPath: z.string(), htmlPath: z.string(), publishCount: z.number().int().nonnegative() }),
  structural: structuralSchema,
  collection: z.object({
    filesRead: z.number().int().nonnegative(),
    sourceBytesRead: z.number().int().nonnegative(),
    cacheHit: z.boolean(),
  }),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative(),
  }),
})

const judgeResultSchema = z.object({
  evidenceQuality: z.object({ criticalCoverage: score, entailment: score, unknownCorrectness: score, provenanceCompleteness: score }),
  decisionUsefulness: z.object({ rubricScore: score, keyRisksOmitted: z.number().int().nonnegative() }),
})

const eventSchema = z.discriminatedUnion('type', [
  z.object({
    schema: z.literal('zj-research-experiment-event/v1'),
    type: z.literal('research-eval/run-started'),
    seq: z.literal(1),
    time: z.number().int().nonnegative(),
    data: identitySchema,
  }),
  z.object({
    schema: z.literal('zj-research-experiment-event/v1'),
    type: z.literal('research-eval/run-completed'),
    seq: z.literal(2),
    time: z.number().int().nonnegative(),
    data: identitySchema.extend({ result: armResultSchema, judge: judgeResultSchema }),
  }),
  z.object({
    schema: z.literal('zj-research-experiment-event/v1'),
    type: z.enum(['research-eval/run-failed', 'research-eval/run-cancelled', 'research-eval/run-budget-exhausted']),
    seq: z.literal(2),
    time: z.number().int().nonnegative(),
    data: identitySchema.extend({ failureClass: z.enum(['adapter-failure', 'judge-failure', 'cancelled', 'duration-budget', 'resource-budget']) }),
  }),
])

const manifestSchema = z.object({
  schema: z.literal('zj-research-experiment/v1'),
  id: z.string().min(1),
  lane: z.enum(['controlled', 'native']),
  corpusVersion: z.string().min(1),
  compiler: z.object({ version: z.string().min(1), artifactSha256: sha256 }),
  policyVersion: z.string().min(1),
  model: z.object({ provider: z.string().min(1), id: z.string().min(1), configFingerprint: sha256 }),
  judge: z.object({ id: z.string().min(1), promptVersion: z.string().min(1), configFingerprint: sha256 }),
  reportFamily: z.enum(['technical-c4/v1', 'zj-draft/v1']),
  cacheCohort: z.enum(['cold', 'warm']),
  navigationFingerprint: sha256,
  repetitions: positiveInteger,
  budget: z.object({
    maxDurationMs: positiveInteger,
    maxInputTokens: positiveInteger,
    maxOutputTokens: positiveInteger,
    maxSourceBytes: positiveInteger,
  }),
  arms: z.array(z.object({ id: z.string().min(1), adapter: z.string().min(1) })).min(2),
  cases: z.array(z.object({
    id: z.string().min(1),
    language: z.enum(['en', 'zh']),
    purpose: z.enum(['quality', 'reliability']),
    scenario: z.enum(['multi-repository-selection', 'single-repository-deep-read', 'insufficient-evidence', 'conflicting-evidence', 'navigation-degraded', 'upstream-failure']),
    briefFingerprint: sha256,
    ledgerFingerprint: sha256.optional(),
    rubricVersion: z.string().min(1),
  })).min(1),
}).superRefine((manifest, context) => {
  if (new Set(manifest.arms.map(arm => arm.id)).size !== manifest.arms.length)
    context.addIssue({ code: 'custom', path: ['arms'], message: 'arm ids must be unique' })
  if (new Set(manifest.cases.map(item => item.id)).size !== manifest.cases.length)
    context.addIssue({ code: 'custom', path: ['cases'], message: 'case ids must be unique' })
  if (manifest.lane === 'controlled')
    for (const [index, item] of manifest.cases.entries())
      if (item.ledgerFingerprint === undefined)
        context.addIssue({ code: 'custom', path: ['cases', index, 'ledgerFingerprint'], message: 'controlled cases require a sealed ledger fingerprint' })
})

/**
 * Parse a manifest at its JSON or file boundary and enforce cross-field invariants.
 * @param value - untrusted decoded JSON value.
 * @returns one complete versioned experiment manifest.
 */
export function parseResearchExperimentManifest(value: unknown): ResearchExperimentManifest {
  return manifestSchema.parse(value) as unknown as ResearchExperimentManifest
}

/**
 * Parse experiment events read from an untyped durable artifact.
 * @param value - decoded JSON array.
 * @returns validated append-only lifecycle facts.
 */
export function parseResearchExperimentEvents(value: unknown): readonly ResearchExperimentEvent[] {
  return z.array(eventSchema).parse(value) as unknown as readonly ResearchExperimentEvent[]
}

/**
 * Derive one stable run id from immutable manifest and selection fields.
 * @param experimentId - versioned experiment identity.
 * @param selection - selected case, arm, and repetition.
 * @returns content-addressed opaque run identity.
 */
export function researchRunId(experimentId: ResearchExperimentIdType, selection: ResearchRunSelection): ResearchRunId {
  return createHash('sha256')
    .update(`${experimentId}\0${selection.caseId}\0${selection.armId}\0${selection.repetition}`)
    .digest('hex') as ResearchRunId
}

/**
 * Expand a manifest into the complete deterministic case/arm/repetition matrix.
 * @param manifestValue - manifest parsed at this operation's input boundary.
 * @returns selections ordered by case, then arm, then repetition.
 */
export function expandResearchExperiment(manifestValue: unknown): readonly ResearchRunSelection[] {
  const manifest = parseResearchExperimentManifest(manifestValue)
  return manifest.cases.flatMap(item => manifest.arms.flatMap(arm =>
    Array.from({ length: manifest.repetitions }, (_unused, index) => ({
      caseId: item.id,
      armId: arm.id,
      repetition: index + 1,
    })),
  ))
}

/** Execute one bounded arm and append exactly one terminal fact after its start fact. */
export class ResearchExperimentRuntime {
  /**
   * @param now - monotonic-enough wall clock used for durable timestamps and duration.
   * @param setDeadline - deadline scheduler injected for deterministic tests.
   * @param clearDeadline - matching scheduler cleanup operation.
   */
  constructor(
    private readonly now: () => number = Date.now,
    private readonly setDeadline: (callback: () => void, delayMs: number) => unknown = setTimeout,
    private readonly clearDeadline: (handle: unknown) => void = (handle) => {
      clearTimeout(handle as ReturnType<typeof setTimeout>)
    },
  ) {}

  /**
   * Execute one selected run through an arm and blind Judge adapter.
   * @param manifestValue - manifest parsed at this operation's input boundary.
   * @param selection - case, arm, and repetition selected by the host.
   * @param armAdapter - implementation named by the selected arm.
   * @param judgeAdapter - independent semantic evaluator.
   * @param sink - durable lifecycle event destination.
   * @param signal - optional caller cancellation.
   * @returns immutable receipt projected only after the terminal event is durable.
   */
  async run(
    manifestValue: unknown,
    selection: ResearchRunSelection,
    armAdapter: ResearchArmAdapter,
    judgeAdapter: ResearchJudgeAdapter,
    sink: ResearchExperimentEventSink,
    signal?: AbortSignal,
  ): Promise<ResearchRunReceipt> {
    const manifest = parseResearchExperimentManifest(manifestValue)
    const selectedCase = manifest.cases.find(item => item.id === selection.caseId)
    if (selectedCase === undefined) throw new Error(`research experiment case not found: ${selection.caseId}`)
    const selectedArm = manifest.arms.find(item => item.id === selection.armId)
    if (selectedArm === undefined) throw new Error(`research experiment arm not found: ${selection.armId}`)
    if (selection.repetition < 1 || selection.repetition > manifest.repetitions)
      throw new Error(`research experiment repetition must be between 1 and ${manifest.repetitions}`)
    if (selectedArm.adapter !== armAdapter.id)
      throw new Error(`research experiment arm requires adapter ${selectedArm.adapter}, received ${armAdapter.id}`)
    if (manifest.judge.id !== judgeAdapter.id)
      throw new Error(`research experiment requires judge ${manifest.judge.id}, received ${judgeAdapter.id}`)

    const runId = researchRunId(manifest.id, selection)
    const identity: ResearchRunIdentity = {
      runId,
      experimentId: manifest.id,
      caseId: selectedCase.id,
      armId: selectedArm.id,
      repetition: selection.repetition,
    }
    const startedAt = this.now()
    const started: ResearchExperimentEvent = {
      schema: 'zj-research-experiment-event/v1',
      type: 'research-eval/run-started',
      seq: 1,
      time: startedAt,
      data: identity,
    }
    const events: ResearchExperimentEvent[] = [started]
    await sink.append(started)

    const controller = new AbortController()
    let durationExpired = false
    const onAbort = () => { controller.abort(signal?.reason) }
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted === true) onAbort()
    const deadline = this.setDeadline(() => {
      durationExpired = true
      controller.abort(new Error('research experiment duration budget exhausted'))
    }, manifest.budget.maxDurationMs)
    let terminal: ResearchExperimentEvent
    try {
      const result = await abortable(
        armAdapter.run({ runId, manifest, case: selectedCase, arm: selectedArm, repetition: selection.repetition }, controller.signal),
        controller.signal,
      )
      enforceArmResult(manifest, result)
      let judge: ResearchJudgeResult
      try {
        judge = await abortable(judgeAdapter.evaluate({
          experimentId: manifest.id,
          caseId: selectedCase.id,
          rubricVersion: selectedCase.rubricVersion,
          reportHash: result.report.hash,
          recommendationFingerprint: result.report.recommendationFingerprint,
          structural: result.structural,
        }, controller.signal), controller.signal)
        enforceJudgeResult(judge)
      } catch (error) {
        throw new JudgeFailure('research judge failed', { cause: error })
      }
      terminal = {
        schema: 'zj-research-experiment-event/v1',
        type: 'research-eval/run-completed',
        seq: 2,
        time: this.now(),
        data: { ...identity, result, judge },
      }
    } catch (error) {
      const failureClass = classifyFailure(error, durationExpired, signal?.aborted === true)
      terminal = {
        schema: 'zj-research-experiment-event/v1',
        type: failureClass === 'duration-budget' || failureClass === 'resource-budget'
          ? 'research-eval/run-budget-exhausted'
          : failureClass === 'cancelled'
            ? 'research-eval/run-cancelled'
            : 'research-eval/run-failed',
        seq: 2,
        time: this.now(),
        data: { ...identity, failureClass },
      }
    } finally {
      this.clearDeadline(deadline)
      signal?.removeEventListener('abort', onAbort)
    }
    events.push(terminal)
    await sink.append(terminal)
    return projectResearchRunReceipt(events)
  }
}

/**
 * Project one immutable receipt from a complete run event stream.
 * @param events - exactly one start followed by one terminal fact.
 * @returns deterministic four-layer health receipt.
 */
export function projectResearchRunReceipt(events: readonly ResearchExperimentEvent[]): ResearchRunReceipt {
  if (events.length !== 2) throw new Error('research run receipt requires exactly one start and one terminal event')
  const [started, terminal] = events
  if (started?.type !== 'research-eval/run-started')
    throw new Error('research run receipt must begin with run-started')
  if (terminal === undefined)
    throw new Error('research run receipt must end with one terminal event')
  if (terminal.type === 'research-eval/run-started')
    throw new Error('research run receipt must end with one terminal event')
  if (!sameIdentity(started.data, terminal.data)) throw new Error('research run lifecycle identity changed before termination')
  const durationMs = terminal.time - started.time
  if (durationMs < 0) throw new Error('research run terminal time precedes its start')

  if (terminal.type !== 'research-eval/run-completed') {
    const outcome = terminal.type === 'research-eval/run-cancelled'
      ? 'cancelled'
      : terminal.type === 'research-eval/run-budget-exhausted'
        ? 'budget-exhausted'
        : 'failed'
    const health: ResearchRunHealth = {
      operational: { terminalComplete: true, outcome, durationMs, failureClass: terminal.data.failureClass },
      structural: null,
      evidence: null,
      usefulness: null,
      hardGatePassed: false,
      overall: 'failed',
    }
    return emptyReceipt(started.data, health)
  }

  const hardGatePassed = Object.values(terminal.data.result.structural).every(Boolean)
  const health: ResearchRunHealth = {
    operational: { terminalComplete: true, outcome: 'completed', durationMs },
    structural: terminal.data.result.structural,
    evidence: terminal.data.judge.evidenceQuality,
    usefulness: terminal.data.judge.decisionUsefulness,
    hardGatePassed,
    overall: hardGatePassed ? 'evaluated' : 'failed',
  }
  return {
    schema: 'zj-research-run-receipt/v1',
    identity: started.data,
    health,
    report: terminal.data.result.report,
    publication: terminal.data.result.publication,
    collection: terminal.data.result.collection,
    usage: terminal.data.result.usage,
  }
}

type CompletedResearchRunReceipt = ResearchRunReceipt & {
  readonly collection: NonNullable<ResearchRunReceipt['collection']>
  readonly usage: NonNullable<ResearchRunReceipt['usage']>
  readonly health: ResearchRunHealth & {
    readonly evidence: NonNullable<ResearchRunHealth['evidence']>
    readonly usefulness: NonNullable<ResearchRunHealth['usefulness']>
  }
}

/**
 * Project reliability from every started log and quality baselines from valid completed reports.
 * @param runs - one event array per attempted run; a start-only array represents an incomplete run.
 * @returns deterministic cohort facts with a null baseline below the 30-sample floor.
 */
export function summarizeResearchCohort(runs: readonly (readonly ResearchExperimentEvent[])[]): ResearchCohortSummary {
  const receipts: ResearchRunReceipt[] = []
  let startedCount = 0
  let incompleteCount = 0
  for (const events of runs) {
    if (events[0]?.type !== 'research-eval/run-started') throw new Error('research cohort contains a run without run-started')
    startedCount += 1
    if (events.length === 1) {
      incompleteCount += 1
      continue
    }
    receipts.push(projectResearchRunReceipt(events))
  }
  const outcomes: ResearchCohortSummary['outcomes'] = {
    completed: count(receipts, receipt => receipt.health.operational.outcome === 'completed'),
    failed: count(receipts, receipt => receipt.health.operational.outcome === 'failed'),
    cancelled: count(receipts, receipt => receipt.health.operational.outcome === 'cancelled'),
    'budget-exhausted': count(receipts, receipt => receipt.health.operational.outcome === 'budget-exhausted'),
    incomplete: incompleteCount,
  }
  const failureClasses: Partial<Record<ResearchRunFailureClass, number>> = {}
  for (const receipt of receipts) {
    const failureClass = receipt.health.operational.failureClass
    if (failureClass !== undefined) failureClasses[failureClass] = (failureClasses[failureClass] ?? 0) + 1
  }
  const quality = receipts.filter(
    receipt => receipt.health.hardGatePassed && receipt.health.overall === 'evaluated',
  ) as CompletedResearchRunReceipt[]
  return {
    startedCount,
    terminalCount: receipts.length,
    terminalCompleteness: startedCount === 0 ? 1 : receipts.length / startedCount,
    outcomes,
    failureClasses,
    hardGatePassRate: startedCount === 0 ? 1 : quality.length / startedCount,
    qualitySampleCount: quality.length,
    baseline: quality.length < 30 ? null : cohortBaseline(quality),
  }
}

function cohortBaseline(receipts: readonly CompletedResearchRunReceipt[]): ResearchCohortBaseline {
  return {
    sampleCount: receipts.length,
    durationMs: cohortAxis(receipts.map(receipt => receipt.health.operational.durationMs)),
    sourceBytesRead: cohortAxis(receipts.map(receipt => receipt.collection.sourceBytesRead)),
    totalTokens: cohortAxis(receipts.map(receipt => receipt.usage.inputTokens + receipt.usage.outputTokens)),
    entailment: cohortAxis(receipts.map(receipt => receipt.health.evidence.entailment)),
    rubricScore: cohortAxis(receipts.map(receipt => receipt.health.usefulness.rubricScore)),
  }
}

function cohortAxis(values: readonly number[]): ResearchCohortAxis {
  const ordered = [...values].sort((left, right) => left - right)
  const center = median(ordered)
  const deviations = ordered.map(value => Math.abs(value - center)).sort((left, right) => left - right)
  const mad = median(deviations)
  const p95Index = Math.ceil(ordered.length * 0.95) - 1
  const p95 = ordered.slice(p95Index, p95Index + 1).reduce((total, value) => total + value, 0)
  return { median: center, p95, mad, warnAbove: p95 + 3 * mad }
}

function median(ordered: readonly number[]): number {
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 === 0
    ? ordered.slice(middle - 1, middle + 1).reduce((total, value) => total + value, 0) / 2
    : ordered.slice(middle, middle + 1).reduce((total, value) => total + value, 0)
}

function count<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  return values.filter(predicate).length
}

function enforceArmResult(manifest: ResearchExperimentManifest, result: ResearchArmResult): void {
  if (result.report.family !== manifest.reportFamily) throw new Error('research arm returned the wrong report family')
  if (!/^[a-f0-9]{64}$/.test(result.report.hash)) throw new Error('research arm returned an invalid report hash')
  if (result.collection.sourceBytesRead > manifest.budget.maxSourceBytes)
    throw new ResourceBudgetFailure('research arm exceeded the source-byte budget')
  if (result.usage.inputTokens > manifest.budget.maxInputTokens || result.usage.outputTokens > manifest.budget.maxOutputTokens)
    throw new ResourceBudgetFailure('research arm exceeded the model-token budget')
}

function enforceJudgeResult(result: ResearchJudgeResult): void {
  for (const value of Object.values(result.evidenceQuality)) score.parse(value)
  score.parse(result.decisionUsefulness.rubricScore)
  z.number().int().nonnegative().parse(result.decisionUsefulness.keyRisksOmitted)
}

function classifyFailure(error: unknown, durationExpired: boolean, callerCancelled: boolean): ResearchRunFailureClass {
  if (durationExpired) return 'duration-budget'
  if (callerCancelled) return 'cancelled'
  if (error instanceof ResourceBudgetFailure) return 'resource-budget'
  return error instanceof JudgeFailure ? 'judge-failure' : 'adapter-failure'
}

/** Tag a semantic-evaluator rejection without leaking provider diagnostics into receipts. */
export class JudgeFailure extends Error {
  /**
   * @param message - stable local diagnostic.
   * @param options - original provider failure retained only as an Error cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'JudgeFailure'
  }
}

/** Tag a deterministic non-time resource budget violation. */
export class ResourceBudgetFailure extends Error {}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortReason(signal))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => { reject(abortReason(signal)) }
    signal.addEventListener('abort', onAbort, { once: true })
    void operation.then(resolve, reject).finally(() => { signal.removeEventListener('abort', onAbort) })
  })
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('research experiment aborted')
}

function sameIdentity(left: ResearchRunIdentity, right: ResearchRunIdentity): boolean {
  return left.runId === right.runId
    && left.experimentId === right.experimentId
    && left.caseId === right.caseId
    && left.armId === right.armId
    && left.repetition === right.repetition
}

function emptyReceipt(identity: ResearchRunIdentity, health: ResearchRunHealth): ResearchRunReceipt {
  return { schema: 'zj-research-run-receipt/v1', identity, health, report: null, publication: null, collection: null, usage: null }
}

/**
 * Cast a validated string to an experiment id at construction sites.
 * @param value - non-empty identity already validated by its caller.
 * @returns opaque experiment identity.
 */
export const ResearchExperimentId = (value: string): ResearchExperimentIdType => value as ResearchExperimentIdType
/**
 * Cast a validated string to a corpus case id at construction sites.
 * @param value - non-empty identity already validated by its caller.
 * @returns opaque corpus case identity.
 */
export const ResearchCaseId = (value: string): ResearchCaseIdType => value as ResearchCaseIdType
/**
 * Cast a validated string to an orchestration arm id at construction sites.
 * @param value - non-empty identity already validated by its caller.
 * @returns opaque orchestration arm identity.
 */
export const ResearchArmId = (value: string): ResearchArmIdType => value as ResearchArmIdType
