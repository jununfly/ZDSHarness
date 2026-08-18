import { createServer } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { createAssistantMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import * as ResearchTelemetry from '@deepseek-ai/dsh-research-telemetry-otel'
import { describe, expect, it } from 'vitest'

describe('research health OTLP metrics', () => {
  it('exports one durable evaluation and drains on plugin disposal', async () => {
    const bodies: Buffer[] = []
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })
      request.on('end', () => {
        bodies.push(Buffer.concat(chunks))
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end('{}')
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('metrics fixture did not bind')
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const fiber = await ctx.plugin(ResearchTelemetry, { url: `http://127.0.0.1:${address.port}/v1/metrics`, exportIntervalMillis: 60_000 })
    const session = ctx.sessions.create(SessionId('research-metrics'))
    session.append(
      'assistant/message',
      {
        turn: 1,
        step: 1,
        message: createAssistantMessage({
          content: [{ type: 'text', text: 'report ready' }],
          source: { provider: 'fixture', model: 'fixture' },
        }),
        usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 3, cacheWriteTokens: 2, reasoningTokens: 1 },
      },
      { surfaceOp: 'append' },
    )
    session.append('research/evaluation-completed', {
      reportHash: 'a'.repeat(64),
      reportFamily: 'technical-c4/v1',
      compilerVersion: 'research/v1',
      healthy: true,
      correctness: {
        revisionPinned: true,
        provenanceComplete: true,
        criticalClaimsEvidence: true,
        scoringAxesSeparated: true,
        publishExactlyOnce: true,
        receiptConsistent: true,
      },
      evidenceCount: 8,
      unknownCount: 1,
      navigationFailureCount: 0,
      collection: { filesRead: 8, sourceBytesRead: 4096, durationMs: 1200, cacheHit: false },
    })

    await fiber.dispose()
    await new Promise<void>(resolve =>
      server.close(() => {
        resolve()
      }),
    )

    expect(bodies).toHaveLength(1)
    expect(bodies[0]!.byteLength).toBeGreaterThan(0)
  })

  it('rejects non-HTTP collector endpoints at load', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await expect(ctx.plugin(ResearchTelemetry, { url: 'file:///tmp/metrics' })).rejects.toThrow('url must be http(s)')
  })
})
