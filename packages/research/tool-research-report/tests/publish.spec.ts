import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { CallId } from '@deepseek-ai/dsh-llm'
import {
  ClaimId,
  ComparisonId,
  CriterionId,
  EvidenceId,
  RecommendationId,
  type ResearchReportIr,
  type VerifiedEvidenceLedger,
} from '@deepseek-ai/dsh-research'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ToolResearchReport from '@deepseek-ai/dsh-tool-research-report'

const roots: string[] = []

const ledger: VerifiedEvidenceLedger = {
  schema: 'zj-verified-evidence-ledger/v1',
  compilerVersion: 'research/v1',
  briefFingerprint: 'ledger-fingerprint',
  policyVersion: 'v1',
  observedAt: '2026-08-18T00:00:00.000Z',
  repositories: [],
  candidates: [{ repository: { owner: 'example', name: 'harness' }, stars: 42, topicMatch: 90, origin: 'explicit' }],
  evidence: [
    {
      id: EvidenceId('evidence-1'),
      criterionId: CriterionId('governance'),
      repository: { owner: 'example', name: 'harness' },
      revision: 'abc123',
      path: 'POLICY.md',
      sourceUrl: 'https://github.com/example/harness/blob/abc123/POLICY.md',
      excerpt: 'Hooks enforce policy.',
      kind: 'canonical',
    },
  ],
  unknownCriteria: [],
  navigation: [],
  collection: { filesRead: 1, sourceBytesRead: 21, durationMs: 10, cacheHit: false },
}

function report(): ResearchReportIr {
  return {
    schema: 'zj-research-report-ir/v1',
    family: 'technical-c4/v1',
    title: 'Harness engineering',
    summary: 'A comparison.',
    ledgerFingerprint: ledger.briefFingerprint,
    concepts: [{ key: 'harness', value: 'Agent execution environment' }],
    diagrams: [
      { title: 'Landscape', kind: 'landscape', mermaid: 'flowchart LR\n  Team --> Harness' },
      { title: 'Container', kind: 'container', mermaid: 'flowchart LR\n  Harness --> Policy' },
    ],
    candidates: [{ repository: { owner: 'example', name: 'harness' }, stars: 42, topicMatch: 90, evidenceIds: [EvidenceId('evidence-1')] }],
    cards: [{ title: 'example/harness', summary: 'Policy hooks are explicit.', claimIds: [ClaimId('claim-1')] }],
    claims: [{ id: ClaimId('claim-1'), text: 'Hooks enforce policy.', critical: true, evidenceIds: [EvidenceId('evidence-1')] }],
    comparisons: [
      { id: ComparisonId('comparison-1'), text: 'Explicit enforcement supports shared governance.', claimIds: [ClaimId('claim-1')] },
    ],
    recommendations: [
      { id: RecommendationId('recommendation-1'), text: 'Adopt explicit policy.', comparisonIds: [ComparisonId('comparison-1')] },
    ],
    metrics: [
      {
        key: 'policy-bypass-rate',
        definition: 'Bypassed governed runs divided by all governed runs',
        unit: '%',
        method: 'Count policy decisions',
        condition: 'Nightly suite',
        expected: '0%',
      },
    ],
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function setup(): Promise<{ root: string; ctx: Context; agent: Agent }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-research-report-'))
  roots.push(root)
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LocalFileSystem, { cwd: root })
  await ctx.plugin(ToolResearchReport)
  const session = ctx.sessions.create(SessionId(`research-report-${roots.length}`))
  session.append('research/evidence-collected', { ledger })
  const agent = { session } as Agent
  return { root, ctx, agent }
}

async function prepare(ctx: Context, agent: Agent, outputPath: string, input: ResearchReportIr = report()): Promise<string> {
  const result = await ctx.tools.execute({
    callId: CallId(`prepare-${outputPath}`),
    name: 'prepare_research_report',
    arguments: { report: input, outputPath },
    agent,
    signal: new AbortController().signal,
  })
  expect(result.isError, JSON.stringify(result.content)).toBe(false)
  if (typeof result.value !== 'object' || result.value === null) throw new Error('prepare result must be an object')
  const value = result.value as Readonly<Record<string, unknown>>
  expect(value.status).toBe('validated')
  expect(typeof value.reportHash).toBe('string')
  if (typeof value.validationToken !== 'string') throw new Error('prepare result must contain a validation token')
  return value.validationToken
}

describe('research report publication transaction', () => {
  it('writes compiler-owned Markdown and offline HTML only after validation', async () => {
    const { root, ctx, agent } = await setup()
    const validationToken = await prepare(ctx, agent, 'reports/agent-harness.md')

    const result = await ctx.tools.execute({
      callId: CallId('publish-report'),
      name: 'publish_research_report',
      arguments: { validationToken },
      agent,
      signal: new AbortController().signal,
    })

    expect(result.isError, JSON.stringify(result.content)).toBe(false)
    const canonicalRoot = await realpath(root)
    expect(result.value).toMatchObject({
      markdownPath: join(canonicalRoot, 'reports/agent-harness.md'),
      htmlPath: join(canonicalRoot, 'reports/agent-harness.html'),
    })
    if (typeof result.value !== 'object' || result.value === null || !('reportHash' in result.value)) throw new Error('missing report hash')
    expect(typeof result.value.reportHash).toBe('string')
    const markdown = await readFile(join(root, 'reports/agent-harness.md'), 'utf8')
    expect(markdown).toContain('# 调研主题\nHarness engineering')
    expect(markdown).toContain('Evidence `evidence-1`')
    const html = await readFile(join(root, 'reports/agent-harness.html'), 'utf8')
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('class="mermaid"')
    expect(html).not.toMatch(/<(?:script|link)[^>]+(?:src|href)=["']https?:\/\//)
  })

  it('returns structured diagnostics without creating a publication token or files', async () => {
    const { root, ctx, agent } = await setup()
    const base = report()
    const invalid: ResearchReportIr = { ...base, claims: [{ ...base.claims[0]!, evidenceIds: [] }] }

    const result = await ctx.tools.execute({
      callId: CallId('invalid-report'),
      name: 'prepare_research_report',
      arguments: { report: invalid, outputPath: 'reports/invalid.md' },
      agent,
      signal: new AbortController().signal,
    })

    expect(result.isError).toBe(false)
    expect(result.value).toEqual({ status: 'invalid', diagnostics: ['critical claim claim-1 has no evidence'] })
    await expect(access(join(root, 'reports/invalid.md'))).rejects.toThrow()
  })

  it('consumes a validated token so a second publish cannot repeat effects', async () => {
    const { ctx, agent } = await setup()
    const validationToken = await prepare(ctx, agent, 'reports/once.md')
    const first = await ctx.tools.execute({
      callId: CallId('publish-once'),
      name: 'publish_research_report',
      arguments: { validationToken },
      agent,
      signal: new AbortController().signal,
    })
    const second = await ctx.tools.execute({
      callId: CallId('publish-twice'),
      name: 'publish_research_report',
      arguments: { validationToken },
      agent,
      signal: new AbortController().signal,
    })

    expect(first.isError).toBe(false)
    expect(second.isError).toBe(true)
    expect(second.error).toMatchObject({ info: { code: 'RESEARCH_REPORT_TOKEN_CONSUMED' } })
  })

  it('reports preserved Markdown and consumes the token when the HTML write fails', async () => {
    const { root, ctx, agent } = await setup()
    const validationToken = await prepare(ctx, agent, 'reports/partial.md')
    const writeText = ctx.fs.writeText.bind(ctx.fs)
    let writes = 0
    ctx.fs.writeText = async (...args) => (++writes === 2 ? Promise.reject(new Error('simulated HTML failure')) : writeText(...args))

    const result = await ctx.tools.execute({
      callId: CallId('partial-publish'),
      name: 'publish_research_report',
      arguments: { validationToken },
      agent,
      signal: new AbortController().signal,
    })

    expect(result.isError).toBe(true)
    expect(result.error).toMatchObject({ info: { code: 'RESEARCH_REPORT_HTML_WRITE_FAILED' } })
    await expect(access(join(root, 'reports/partial.md'))).resolves.toBeUndefined()
    const retry = await ctx.tools.execute({
      callId: CallId('partial-retry'),
      name: 'publish_research_report',
      arguments: { validationToken },
      agent,
      signal: new AbortController().signal,
    })
    expect(retry.error).toMatchObject({ info: { code: 'RESEARCH_REPORT_TOKEN_CONSUMED' } })
  })

  it('does not overwrite a target created after validation', async () => {
    const { root, ctx, agent } = await setup()
    const validationToken = await prepare(ctx, agent, 'reports/raced.md')
    await mkdir(join(root, 'reports'), { recursive: true })
    await writeFile(join(root, 'reports/raced.md'), 'competitor')

    const result = await ctx.tools.execute({
      callId: CallId('raced-publish'),
      name: 'publish_research_report',
      arguments: { validationToken },
      agent,
      signal: new AbortController().signal,
    })

    expect(result.isError).toBe(true)
    expect(await readFile(join(root, 'reports/raced.md'), 'utf8')).toBe('competitor')
    await expect(access(join(root, 'reports/raced.html'))).rejects.toThrow()
  })
})
