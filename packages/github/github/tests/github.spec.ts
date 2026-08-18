import { Context } from '@deepseek-ai/cordis'
import GitHubRuntime, { GitHubError, type GitHubProvider, type GitHubRepository } from '@deepseek-ai/dsh-github'
import { describe, expect, it } from 'vitest'

function repository(name: string, stars: number): GitHubRepository {
  return {
    ref: { owner: 'deepseek-ai', name },
    fullName: `deepseek-ai/${name}`,
    url: `https://github.com/deepseek-ai/${name}`,
    description: `${name} description`,
    stars,
    forks: 1,
    openIssues: 2,
    archived: false,
    defaultBranch: 'main',
    pushedAt: '2026-08-17T00:00:00Z',
    topics: ['agents'],
    license: 'MIT',
    primaryLanguage: 'TypeScript',
  }
}

describe('GitHubRuntime repository search', () => {
  it('caps provider results at the requested limit and reports truncation', async () => {
    const ctx = new Context()
    await ctx.plugin(GitHubRuntime)
    const repositories = [repository('one', 30), repository('two', 20), repository('three', 10)]
    const provider: GitHubProvider = {
      id: 'fixture',
      available: () => true,
      searchRepositories: () =>
        Promise.resolve({
          repositories,
          observedAt: '2026-08-17T00:00:00Z',
          truncated: false,
        }),
      readRepository: () => Promise.reject(new Error('not used')),
    }
    ctx.github.registerProvider(provider)

    await expect(ctx.github.searchRepositories({ query: 'agent harness', limit: 2 })).resolves.toEqual({
      repositories: repositories.slice(0, 2),
      observedAt: '2026-08-17T00:00:00Z',
      truncated: true,
    })
  })

  it('reports a routable error when no provider is available', async () => {
    const ctx = new Context()
    await ctx.plugin(GitHubRuntime)

    await expect(ctx.github.searchRepositories({ query: 'agent harness', limit: 2 })).rejects.toEqual(
      expect.objectContaining<Partial<GitHubError>>({
        name: 'GitHubError',
        code: 'GITHUB_PROVIDER_UNAVAILABLE',
      }),
    )
  })
})
