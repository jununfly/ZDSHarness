import { createServer, type ServerResponse } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { resolveExampleLaunch } from '@deepseek-ai/dsh-loader-smoke'
import {
  ClaimId,
  ComparisonId,
  CriterionId,
  EvidenceId,
  RecommendationId,
  researchBriefFingerprint,
  type ResearchBrief,
  type ResearchEvidenceDigest,
  type ResearchReportIr,
  type VerifiedEvidenceLedger,
} from '@deepseek-ai/dsh-research'

const configPath = fileURLToPath(new URL('../cordis.snapshot.yml', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const repoTsconfig = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const runtimeBin = fileURLToPath(new URL('../../../packages/examples/jsonrpc-demo/src/bin.ts', import.meta.url))

const brief: ResearchBrief = {
  schema: 'zj-research-brief/v1',
  topic: 'Agent harness',
  criteria: [
    { id: CriterionId('governance'), question: 'How does the harness enforce policy?', critical: true, keywords: ['plugin', 'policy'] },
  ],
  repositories: [{ owner: 'deepseek-ai', name: 'example-harness' }],
  policyVersion: 'snapshot-v1',
  budget: { maxFiles: 4, maxBytes: 10_000 },
}
const ledger: VerifiedEvidenceLedger = {
  schema: 'zj-verified-evidence-ledger/v1',
  compilerVersion: 'research/v1',
  briefFingerprint: researchBriefFingerprint(brief),
  policyVersion: brief.policyVersion,
  observedAt: '2026-08-17T00:00:00.000Z',
  repositories: [
    {
      repository: brief.repositories[0]!,
      revision: { sha: 'abc123', branch: 'main', url: 'https://github.com/deepseek-ai/example-harness/commit/abc123' },
      tree: [{ path: 'docs/cordis-tutorial/01-first-plugin.md', type: 'blob', sha: 'file123', size: 64 }],
    },
  ],
  candidates: [{ repository: brief.repositories[0]!, stars: 420, topicMatch: 50, origin: 'explicit' }],
  evidence: [
    {
      id: EvidenceId('evidence-1'),
      criterionId: CriterionId('governance'),
      repository: brief.repositories[0]!,
      revision: 'abc123',
      path: 'docs/cordis-tutorial/01-first-plugin.md',
      sourceUrl: 'https://github.com/deepseek-ai/example-harness/blob/abc123/docs/cordis-tutorial/01-first-plugin.md',
      excerpt: 'A plugin-based agent harness enforces policy through plugins.',
      kind: 'canonical',
    },
  ],
  unknownCriteria: [],
  navigation: [{ adapter: 'heuristic', repository: brief.repositories[0]!, status: 'used' }],
  collection: { filesRead: 1, sourceBytesRead: 64, durationMs: 10, cacheHit: false },
}
const report: ResearchReportIr = {
  schema: 'zj-research-report-ir/v1',
  family: 'technical-c4/v1',
  title: 'Agent harness',
  summary: 'A plugin-based harness comparison.',
  ledgerFingerprint: ledger.briefFingerprint,
  concepts: [{ key: 'agent-harness', value: 'Coordinates models, tools, and policy' }],
  diagrams: [
    { title: 'Landscape', kind: 'landscape', mermaid: 'flowchart LR\n  User --> Harness\n  Harness --> GitHub' },
    { title: 'Policy container', kind: 'container', mermaid: 'flowchart LR\n  Harness --> Policy' },
  ],
  candidates: [{ repository: brief.repositories[0]!, stars: 420, topicMatch: 50, evidenceIds: [EvidenceId('evidence-1')] }],
  cards: [{ title: 'deepseek-ai/example-harness', summary: 'Plugins enforce policy.', claimIds: [ClaimId('claim-1')] }],
  claims: [{ id: ClaimId('claim-1'), text: 'Plugins enforce policy.', critical: true, evidenceIds: [EvidenceId('evidence-1')] }],
  comparisons: [{ id: ComparisonId('comparison-1'), text: 'Plugin policy fits shared governance.', claimIds: [ClaimId('claim-1')] }],
  recommendations: [
    {
      id: RecommendationId('recommendation-1'),
      text: 'Validate plugin policy under team load.',
      comparisonIds: [ComparisonId('comparison-1')],
    },
  ],
  metrics: [
    {
      key: 'policy-bypass-rate',
      definition: 'Bypassed governed runs divided by all governed runs',
      unit: '%',
      method: 'Count policy decisions',
      condition: 'Fixed nightly suite',
      expected: '0%',
    },
  ],
}

function reportFor(collected: ResearchEvidenceDigest): ResearchReportIr {
  const candidate = collected.candidates[0]
  const evidence = collected.evidence[0]
  if (candidate === undefined || evidence === undefined) {
    throw new Error(`research digest fixture is incomplete: ${JSON.stringify({
      candidateCount: collected.candidates.length,
      evidenceCount: collected.evidence.length,
      unknownCriteria: collected.unknownCriteria,
      navigation: collected.navigation,
      collection: collected.collection,
    })}`)
  }
  return {
    ...report,
    ledgerFingerprint: collected.ledgerFingerprint,
    candidates: [{
      repository: candidate.repository,
      stars: candidate.stars,
      topicMatch: candidate.topicMatch,
      evidenceIds: [evidence.id],
    }],
    claims: report.claims.map(claim => ({ ...claim, evidenceIds: [evidence.id] })),
  }
}

function sendTool(response: ServerResponse, index: number, name: string, args: unknown): void {
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  response.write(
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: `call-${index}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: null }] })}\n\n`,
  )
  response.write(
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 3, completion_tokens: 3 } })}\n\n`,
  )
  response.end('data: [DONE]\n\n')
}

function parseToolResult(content: string, expected: string): unknown {
  if (content.startsWith('Error:')) throw new Error(`${expected} failed: ${content}`)
  return JSON.parse(content) as unknown
}

describe('tech research keyless snapshot', () => {
  it('runs evidence compilation, Report IR validation, and publication through the assembled agent', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-tech-research-flow-'))
    const emittedTools: string[] = []
    let requestIndex = 0
    let collectedEvidenceId: string | undefined
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })
      request.on('end', () => {
        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString()) as { messages?: Array<{ role?: string; content?: string }> }
          requestIndex += 1
          if (requestIndex === 1) {
            emittedTools.push('research_collect_evidence')
            sendTool(response, requestIndex, 'research_collect_evidence', { brief })
          } else if (requestIndex === 2) {
            const toolContent = [...(payload.messages ?? [])].reverse().find(message => message.role === 'tool')?.content
            if (toolContent === undefined) throw new Error('evidence tool result missing from model request')
            const collected = parseToolResult(toolContent, 'evidence collection') as ResearchEvidenceDigest
            collectedEvidenceId = collected.evidence[0]?.id
            emittedTools.push('prepare_research_report')
            sendTool(response, requestIndex, 'prepare_research_report', {
              report: reportFor(collected),
              outputPath: 'reports/agent-harness-20260817T000000Z.md',
            })
          } else if (requestIndex === 3) {
            const toolContent = [...(payload.messages ?? [])].reverse().find(message => message.role === 'tool')?.content
            if (toolContent === undefined) throw new Error('prepare tool result missing from model request')
            const validationToken = (parseToolResult(toolContent, 'report preparation') as { validationToken?: string }).validationToken
            if (validationToken === undefined) throw new Error('prepare result has no validation token')
            emittedTools.push('publish_research_report')
            sendTool(response, requestIndex, 'publish_research_report', { validationToken })
          } else {
            response.writeHead(200, { 'content-type': 'text/event-stream' })
            response.write('data: {"choices":[{"delta":{"content":"Research report published."}}]}\n\n')
            response.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":3}}\n\n')
            response.end('data: [DONE]\n\n')
          }
        } catch (error) {
          response.destroy(error instanceof Error ? error : new Error(String(error)))
        }
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('model server did not bind')
    const launch = resolveExampleLaunch({ srcBin: runtimeBin, configArgs: [], tsconfigPath: repoTsconfig })
    const harness = new DeepSeekHarness({
      launch: {
        command: launch.command,
        args: launch.args,
        cwd: repoRoot,
        env: {
          ...process.env,
          ...launch.env,
          DEEPSEEK_API_KEY: 'keyless',
          DEEPSEEK_BASE_URL: `http://127.0.0.1:${address.port}`,
          DSH_CORDIS_CONFIG: configPath,
          DSH_CWD: cwd,
          DSH_SESSION_ROOT: join(cwd, '.sessions'),
        },
      },
      cwd,
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
    })
    try {
      const result = await harness.run('Research agent harness implementations and publish the report.', {
        sessionId: 'tech-research-flow',
      })
      const markdown = await readFile(join(cwd, 'reports/agent-harness-20260817T000000Z.md'), 'utf8')
      const html = await readFile(join(cwd, 'reports/agent-harness-20260817T000000Z.html'), 'utf8')
      expect({
        finalResponse: result.finalResponse,
        emittedTools,
        requestCount: requestIndex,
        markdownMatchScore: markdown.includes('| deepseek-ai/example-harness | 420 | 50 |'),
        markdownIsCompilerOwned: collectedEvidenceId !== undefined && markdown.includes(`Evidence \`${collectedEvidenceId}\``),
        htmlIsOffline: html.includes('mermaid.initialize') && !/<script[^>]+src=/.test(html),
      }).toMatchInlineSnapshot(`
        {
          "emittedTools": [
            "research_collect_evidence",
            "prepare_research_report",
            "publish_research_report",
          ],
          "finalResponse": "Research report published.",
          "htmlIsOffline": true,
          "markdownIsCompilerOwned": true,
          "markdownMatchScore": true,
          "requestCount": 4,
        }
      `)
    } finally {
      await harness.close()
      await new Promise<void>(resolve =>
        server.close(() => {
          resolve()
        }),
      )
      await rm(cwd, { recursive: true, force: true })
    }
  }, 40_000)
})
