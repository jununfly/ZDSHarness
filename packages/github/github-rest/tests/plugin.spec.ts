import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import GitHubRuntime from '@deepseek-ai/dsh-github'
import * as githubRestPlugin from '@deepseek-ai/dsh-github-rest'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('github-rest plugin', () => {
  it('registers an anonymous provider for the plugin fiber lifetime', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              total_count: 0,
              incomplete_results: false,
              items: [],
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
      ),
    )
    const ctx = new Context()
    await ctx.plugin(GitHubRuntime)
    const fiber = await ctx.plugin(githubRestPlugin, { timeoutMs: 10_000 })

    await expect(ctx.github.searchRepositories({ query: 'agent harness', limit: 1 })).resolves.toMatchObject({ repositories: [] })
    await fiber.dispose()
    await expect(ctx.github.searchRepositories({ query: 'agent harness', limit: 1 })).rejects.toThrow(
      expect.objectContaining({ code: 'GITHUB_PROVIDER_UNAVAILABLE' }),
    )
  })
})
