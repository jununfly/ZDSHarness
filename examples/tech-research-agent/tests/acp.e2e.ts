import { createServer, type ServerResponse } from 'node:http'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION } from '@agentclientprotocol/sdk'
import { launchAcpTestAgent, type AgentUnderTest, type LaunchedAcpTestAgent } from '@deepseek-ai/dsh-acp-snapshot'
import {
  ClaimId,
  ComparisonId,
  CriterionId,
  RecommendationId,
  type ResearchBrief,
  type ResearchEvidenceDigest,
  type ResearchReportIr,
} from '@deepseek-ai/dsh-research'

const AGENT: AgentUnderTest = {
  binScript: fileURLToPath(new URL('../../../packages/examples/acp-demo/src/bin.ts', import.meta.url)),
  configPath: fileURLToPath(new URL('../cordis.acp.snapshot.yml', import.meta.url)),
  tsconfigPath: fileURLToPath(new URL('../../../tsconfig.json', import.meta.url)),
}

const brief: ResearchBrief = {
  schema: 'zj-research-brief/v1',
  topic: 'ACP harness policy',
  criteria: [{ id: CriterionId('policy'), question: 'How do plugins enforce policy?', critical: true, keywords: ['plugin', 'policy'] }],
  repositories: [{ owner: 'deepseek-ai', name: 'example-harness' }],
  policyVersion: 'acp-snapshot-v1',
  budget: { maxFiles: 4, maxBytes: 10_000 },
}

function reportFor(digest: ResearchEvidenceDigest): ResearchReportIr {
  const candidate = digest.candidates[0]
  const evidence = digest.evidence[0]
  if (candidate === undefined || evidence === undefined) {
    throw new Error(`research digest fixture is incomplete: ${JSON.stringify({
      candidateCount: digest.candidates.length,
      evidenceCount: digest.evidence.length,
      unknownCriteria: digest.unknownCriteria,
      navigation: digest.navigation,
      collection: digest.collection,
    })}`)
  }
  return {
    schema: 'zj-research-report-ir/v1',
    family: 'technical-c4/v1',
    title: 'ACP research',
    summary: 'ACP automation.',
    ledgerFingerprint: digest.ledgerFingerprint,
    concepts: [{ key: 'acp', value: 'Agent transport' }],
    diagrams: [
      { title: 'Landscape', kind: 'landscape', mermaid: 'flowchart LR\n  Client --> ACP' },
      { title: 'Container', kind: 'container', mermaid: 'flowchart LR\n  ACP --> Agent' },
    ],
    candidates: [{
      repository: candidate.repository,
      stars: candidate.stars,
      topicMatch: candidate.topicMatch,
      evidenceIds: [evidence.id],
    }],
    cards: [{ title: 'ACP', summary: 'Plugin policy.', claimIds: [ClaimId('claim-1')] }],
    claims: [{ id: ClaimId('claim-1'), text: evidence.excerpt, critical: true, evidenceIds: [evidence.id] }],
    comparisons: [{ id: ComparisonId('comparison-1'), text: 'Plugin policy supports automation.', claimIds: [ClaimId('claim-1')] }],
    recommendations: [
      { id: RecommendationId('recommendation-1'), text: 'Validate real APIs separately.', comparisonIds: [ComparisonId('comparison-1')] },
    ],
    metrics: [
      { key: 'calls', definition: 'Completed calls', unit: 'count', method: 'Session log count', condition: 'ACP fixture', expected: '1' },
    ],
  }
}

function sendTool(response: ServerResponse, name: string, argumentsValue: unknown): void {
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  response.write(
    `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: `acp-${name}`, type: 'function', function: { name, arguments: JSON.stringify(argumentsValue) } }] } }] })}\n\n`,
  )
  response.write('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":3,"completion_tokens":3}}\n\n')
  response.end('data: [DONE]\n\n')
}

function parseToolResult(content: string, expected: string): unknown {
  if (content.startsWith('Error:')) throw new Error(`${expected} failed: ${content}`)
  return JSON.parse(content) as unknown
}

let spawned: LaunchedAcpTestAgent | undefined
let workdir: string | undefined

afterEach(async () => {
  const active = spawned
  const root = workdir
  spawned = undefined
  workdir = undefined
  if (active !== undefined) await active.close('SIGKILL')
  if (root !== undefined) await rm(root, { recursive: true, force: true })
})

describe('tech research agent over ACP', () => {
  it('publishes the report through a real ACP prompt and exposes all research tools', async () => {
    workdir = await mkdtemp(join(tmpdir(), 'dsh-tech-research-acp-'))
    let requestIndex = 0
    let assembledTools: string[] = []
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })
      request.on('end', () => {
        try {
          requestIndex += 1
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
            tools?: Array<{ function?: { name?: string } }>
            messages?: Array<{ role?: string; content?: string }>
          }
          if (requestIndex === 1) {
            assembledTools = body.tools?.flatMap(tool => tool.function?.name ?? []) ?? []
            sendTool(response, 'research_collect_evidence', { brief })
            return
          }
          if (requestIndex === 2) {
            const content = [...(body.messages ?? [])].reverse().find(message => message.role === 'tool')?.content
            if (content === undefined) throw new Error('evidence result missing')
            const collected = parseToolResult(content, 'evidence collection') as ResearchEvidenceDigest
            sendTool(response, 'prepare_research_report', { report: reportFor(collected), outputPath: 'reports/acp-report.md' })
            return
          }
          if (requestIndex === 3) {
            const content = [...(body.messages ?? [])].reverse().find(message => message.role === 'tool')?.content
            if (content === undefined) throw new Error('prepare result missing')
            const validationToken = (parseToolResult(content, 'report preparation') as { validationToken?: string }).validationToken
            if (validationToken === undefined) throw new Error('validation token missing')
            sendTool(response, 'publish_research_report', { validationToken })
            return
          }
          response.writeHead(200, { 'content-type': 'text/event-stream' })
          response.write('data: {"choices":[{"delta":{"content":"ACP report published."}}]}\n\n')
          response.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":3}}\n\n')
          response.end('data: [DONE]\n\n')
        } catch (error) {
          response.destroy(error instanceof Error ? error : new Error(String(error)))
        }
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('model server did not bind')
    try {
      spawned = launchAcpTestAgent({
        agent: AGENT,
        cwd: workdir,
        env: {
          DEEPSEEK_API_KEY: 'keyless',
          DEEPSEEK_BASE_URL: `http://127.0.0.1:${address.port}`,
          DSH_CWD: workdir,
          DSH_SESSION_ROOT: join(workdir, '.sessions'),
        },
      })
      await spawned.client.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {} })
      const { sessionId } = await spawned.client.newSession({ cwd: workdir, mcpServers: [] })
      const result = await spawned.client.prompt({ sessionId, prompt: [{ type: 'text', text: 'Publish the prepared research report.' }] })

      expect(result.stopReason).toBe('end_turn')
      expect(assembledTools).toEqual(
        expect.arrayContaining(['research_collect_evidence', 'prepare_research_report', 'publish_research_report']),
      )
      await expect(access(join(workdir, 'reports/acp-report.md'))).resolves.toBeUndefined()
      await expect(access(join(workdir, 'reports/acp-report.html'))).resolves.toBeUndefined()
    } finally {
      await new Promise<void>(resolve =>
        server.close(() => {
          resolve()
        }),
      )
    }
  }, 60_000)
})
