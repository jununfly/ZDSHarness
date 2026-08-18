import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { resolveExampleLaunch } from '@deepseek-ai/dsh-loader-smoke'
import { describe, expect, it } from 'vitest'

const configPath = fileURLToPath(new URL('../cordis.yml', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const repoTsconfig = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const runtimeBin = fileURLToPath(new URL('../../../packages/examples/jsonrpc-demo/src/bin.ts', import.meta.url))

describe('tech-research-agent keyless SDK smoke', () => {
  it('completes one turn through the real JSON-RPC composition', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-tech-research-agent-'))
    const requestedToolNames = new Set<string | undefined>()
    let requestedMaxTokens: number | undefined
    const modelServer = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          max_tokens?: number
          tools?: Array<{ function?: { name?: string } }>
        }
        requestedMaxTokens = body.max_tokens
        const toolNames = body.tools?.map(tool => tool.function?.name) ?? []
        for (const toolName of toolNames) requestedToolNames.add(toolName)
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.write('data: {"choices":[{"delta":{"role":"assistant","content":"tech research ready"}}]}\n\n')
        response.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":3}}\n\n')
        response.end('data: [DONE]\n\n')
      })
    })
    await new Promise<void>(resolve => modelServer.listen(0, '127.0.0.1', resolve))
    const address = modelServer.address()
    if (address === null || typeof address === 'string') throw new Error('model server did not bind a TCP port')

    const launch = resolveExampleLaunch({
      srcBin: runtimeBin,
      configArgs: [],
      tsconfigPath: repoTsconfig,
    })
    const harness = new DeepSeekHarness({
      launch: {
        command: launch.command,
        args: launch.args,
        cwd: repoRoot,
        env: {
          ...process.env,
          ...launch.env,
          DEEPSEEK_API_KEY: 'keyless-smoke-no-call',
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
      const result = await harness.run('Confirm that the research agent starts.', { sessionId: 'tech-research-smoke' })
      expect(result.finalResponse).toBe('tech research ready')
      expect(result.events.some(event => event.type === 'user/message')).toBe(true)
      expect(result.events.some(event => event.type === 'assistant/message')).toBe(true)
      expect(result.events.some(event => event.type === 'turn/end')).toBe(true)
      expect(requestedMaxTokens).toBe(32_768)
      const requestHeader = result.events.find(event => event.type === 'request/header')
      const headerToolNames = requestHeader?.type === 'request/header'
        ? (requestHeader.data.header.tools ?? []).map(tool => tool.name)
        : []
      expect(headerToolNames).toEqual(expect.arrayContaining([
        'research_collect_evidence',
        'prepare_research_report',
        'publish_research_report',
      ]))
      expect([...requestedToolNames]).toEqual(expect.arrayContaining([
        'research_collect_evidence',
        'prepare_research_report',
        'publish_research_report',
      ]))
    } finally {
      await harness.close()
      await new Promise<void>(resolve =>
        modelServer.close(() => {
          resolve()
        }),
      )
      await rm(cwd, { recursive: true, force: true })
    }
  }, 40_000)
})
