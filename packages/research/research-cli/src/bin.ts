#!/usr/bin/env node
/** Process entry for the standalone research JSON protocol. */
import { GitHubRestProvider } from '@deepseek-ai/dsh-github-rest'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import {
  DeepWikiMcpClient,
  DeepWikiMcpToolClient,
  DeepWikiResearchNavigator,
  FileResearchEvidenceCache,
  HeuristicResearchNavigator,
} from '@deepseek-ai/dsh-research'
import { handleResearchCliRequest, type ResearchCliRequest } from './index.ts'

async function main(): Promise<void> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
  const request = JSON.parse(Buffer.concat(chunks).toString('utf8')) as ResearchCliRequest
  const provider = new GitHubRestProvider({ resolveToken: () => Promise.resolve(process.env.GITHUB_TOKEN), timeoutMs: 30_000 })
  const deepWikiUrl = process.env.DEEPWIKI_MCP_URL
  const allowed = new Set(
    (process.env.DSH_RESEARCH_EXTERNAL_NAVIGATION_REPOSITORIES ?? '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
  )
  const tools = deepWikiUrl === undefined ? undefined : new DeepWikiMcpToolClient({ url: deepWikiUrl, timeoutMs: 10_000 })
  try {
    const navigators =
      tools === undefined
        ? undefined
        : [
          new DeepWikiResearchNavigator(new DeepWikiMcpClient(tools), repository =>
            allowed.has(`${repository.owner}/${repository.name}`.toLowerCase()),
          ),
          new HeuristicResearchNavigator(),
        ]
    const response = await handleResearchCliRequest(request, provider, undefined, {
      ...(navigators === undefined ? {} : { navigators }),
      cache: new FileResearchEvidenceCache(dshHomePath('cache', 'research', 'v1')),
    })
    process.stdout.write(`${JSON.stringify(response)}\n`)
  } finally {
    await tools?.close()
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ protocol: 'zj-research-cli/v1', error: error instanceof Error ? error.message : String(error) })}\n`,
  )
  process.exitCode = 1
})
