import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import GitHubRuntime, { type GitHubProvider } from '@deepseek-ai/dsh-github'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ToolGitHub from '@deepseek-ai/dsh-tool-github'

const signal = new AbortController().signal

describe('GitHub tools', () => {
  it('searches through ctx.github and returns canonical repository JSON', async () => {
    const provider: GitHubProvider = {
      id: 'stub',
      available: () => true,
      searchRepositories: (_request, receivedSignal) => {
        expect(receivedSignal).toBe(signal)
        return Promise.resolve({
          repositories: [
            {
              ref: { owner: 'deepseek-ai', name: 'example' },
              fullName: 'deepseek-ai/example',
              url: 'https://github.com/deepseek-ai/example',
              description: 'research agent',
              stars: 42,
              forks: 5,
              openIssues: 3,
              archived: false,
              defaultBranch: 'main',
              pushedAt: '2026-08-17T00:00:00Z',
              topics: ['research'],
              license: 'Apache-2.0',
              primaryLanguage: 'TypeScript',
            },
          ],
          observedAt: '2026-08-17T01:00:00.000Z',
          truncated: false,
        })
      },
      readRepository: () => Promise.reject(new Error('not used')),
    }
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(GitHubRuntime)
    ctx.github.registerProvider(provider)
    await ctx.plugin(ToolGitHub, { searchMaxResults: 30 })

    const result = await ctx.tools.execute({
      callId: CallId('github-search'),
      name: 'github_search_repositories',
      arguments: { query: 'research agent' },
      signal,
    })

    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({
      repositories: [{ fullName: 'deepseek-ai/example', stars: 42 }],
      observedAt: '2026-08-17T01:00:00.000Z',
      truncated: false,
    })
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.value, null, 2) }])
    expect(ctx.tools.get('github_search_repositories')?.presentCall?.({ query: 'research agent' })).toMatchObject({
      card: 'generic',
      kind: 'search',
      title: 'research agent',
    })
  })
})
