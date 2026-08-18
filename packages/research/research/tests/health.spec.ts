import { Context } from '@deepseek-ai/cordis'
import { createAssistantMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import {
  evaluateResearchPublication,
  researchEfficiencyBaseline,
  researchHealthMetrics,
  researchHealthProjectionDefinition,
  type ResearchReportIr,
  type VerifiedEvidenceLedger,
} from '@deepseek-ai/dsh-research'
import { describe, expect, it } from 'vitest'

describe('research health projection', () => {
  it('projects validation attempts, one publish, and the latest deterministic evaluation', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    ctx.sessionProjections.register(researchHealthProjectionDefinition)
    const session = ctx.sessions.create(SessionId('research-health'))
    const evaluation = {
      reportHash: 'a'.repeat(64),
      reportFamily: 'technical-c4/v1' as const,
      compilerVersion: 'research/v1' as const,
      healthy: true,
      correctness: {
        revisionPinned: true,
        provenanceComplete: true,
        criticalClaimsEvidence: true,
        scoringAxesSeparated: true,
        publishExactlyOnce: true,
        receiptConsistent: true,
      },
      evidenceCount: 3,
      unknownCount: 1,
      navigationFailureCount: 0,
      collection: { filesRead: 3, sourceBytesRead: 1000, durationMs: 20, cacheHit: false },
    }

    session.append(
      'assistant/message',
      {
        turn: 1,
        step: 1,
        message: createAssistantMessage({ content: [{ type: 'text', text: 'draft' }], source: { provider: 'fixture', model: 'fixture' } }),
        usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 3, cacheWriteTokens: 2, reasoningTokens: 1 },
      },
      { surfaceOp: 'append' },
    )
    session.append('research/report-prepared', { status: 'invalid', outputPath: 'report.md', diagnostics: ['missing evidence'] })
    session.append('research/report-prepared', {
      status: 'validated',
      outputPath: 'report.md',
      reportHash: evaluation.reportHash,
      diagnostics: [],
    })
    session.append('research/report-published', { reportHash: evaluation.reportHash, markdownPath: '/report.md', htmlPath: '/report.html' })
    session.append('research/evaluation-completed', evaluation)

    expect(ctx.sessionProjections.snapshot(session).values.researchHealth).toEqual({
      prepareAttempts: 2,
      invalidPrepareAttempts: 1,
      publishCount: 1,
      latestReceipt: { reportHash: evaluation.reportHash, markdownPath: '/report.md', htmlPath: '/report.html' },
      modelUsage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 3, cacheWriteTokens: 2, reasoningTokens: 1 },
      latest: evaluation,
    })
  })

  it('marks revision drift as unhealthy', () => {
    const ledger = {
      repositories: [
        { repository: { owner: 'example', name: 'harness' }, revision: { sha: 'pinned', branch: 'main', url: 'url' }, tree: [] },
      ],
      evidence: [
        { repository: { owner: 'example', name: 'harness' }, revision: 'moving', path: 'README.md', sourceUrl: 'url', excerpt: 'fact' },
      ],
      unknownCriteria: [],
      navigation: [],
    } as unknown as VerifiedEvidenceLedger
    const report = { claims: [], candidates: [] } as unknown as ResearchReportIr

    expect(
      evaluateResearchPublication(report, ledger, {
        reportHash: 'a'.repeat(64),
        markdownPath: '/report.md',
        htmlPath: '/report.html',
        publishCount: 1,
      }),
    ).toMatchObject({ healthy: false, correctness: { revisionPinned: false } })
  })

  it('rejects duplicate publication facts and emits only low-cardinality metric attributes', () => {
    const ledger = {
      compilerVersion: 'research/v1',
      repositories: [],
      evidence: [],
      unknownCriteria: [],
      navigation: [],
      collection: { filesRead: 1, sourceBytesRead: 10, durationMs: 5, cacheHit: false },
    } as unknown as VerifiedEvidenceLedger
    const report = { family: 'technical-c4/v1', claims: [], candidates: [] } as unknown as ResearchReportIr
    const evaluation = evaluateResearchPublication(report, ledger, {
      reportHash: 'a'.repeat(64),
      markdownPath: '/report.md',
      htmlPath: '/report.html',
      publishCount: 2,
    })

    expect(evaluation).toMatchObject({ healthy: false, correctness: { publishExactlyOnce: false } })
    expect(researchHealthMetrics(evaluation)).toEqual(
      expect.arrayContaining([
        { name: 'dsh.research.healthy', value: 0, attributes: { reportFamily: 'technical-c4/v1', compilerVersion: 'research/v1' } },
      ]),
    )
  })

  it('sets efficiency thresholds only after thirty comparable samples', () => {
    const samples = Array.from({ length: 30 }, (_, index) => ({
      filesRead: index + 1,
      sourceBytesRead: (index + 1) * 100,
      durationMs: (index + 1) * 10,
      cacheHit: false,
    }))

    expect(researchEfficiencyBaseline(samples.slice(0, 29))).toBeUndefined()
    expect(researchEfficiencyBaseline(samples)).toEqual({
      sampleCount: 30,
      durationMs: { median: 155, p95: 290, mad: 75, warnAbove: 515 },
      sourceBytesRead: { median: 1550, p95: 2900, mad: 750, warnAbove: 5150 },
      filesRead: { median: 15.5, p95: 29, mad: 7.5, warnAbove: 51.5 },
    })
  })
})
