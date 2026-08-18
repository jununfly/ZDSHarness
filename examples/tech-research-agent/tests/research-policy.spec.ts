import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CallId, HarnessError } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'
import * as ResearchPolicy from '../src/research-policy.ts'

describe('technical research failure policy', () => {
  it('ends the active turn after a GitHub rate-limit failure', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(ResearchPolicy)
    ctx.tools.register(defineTool({
      name: 'research_collect_evidence',
      description: 'fixture',
      parameters: {},
      output: { schema: { type: 'object', additionalProperties: false }, render: () => [] },
      execute: () => Promise.reject(new HarnessError('retry later', 'GITHUB_RATE_LIMITED')),
    }))
    const cancel = vi.fn<Agent['cancel']>()
    const agent = { cancel } as unknown as Agent

    const result = await ctx.tools.execute({
      callId: CallId('rate-limited'),
      name: 'research_collect_evidence',
      arguments: {},
      agent,
      signal: new AbortController().signal,
    })

    expect(result).toMatchObject({ isError: true, error: { info: { code: 'GITHUB_RATE_LIMITED' } } })
    expect(cancel).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledWith({ kind: 'hook', reason: 'GitHub evidence source is rate limited' })
  })
})
