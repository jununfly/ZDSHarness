import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitHubError } from '@deepseek-ai/dsh-github'
import { GitHubRestProvider } from '@deepseek-ai/dsh-github-rest'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function githubErrorOf(promise: Promise<unknown>): Promise<GitHubError> {
  try {
    await promise
  } catch (error: unknown) {
    if (error instanceof GitHubError) return error
    throw error
  }
  throw new Error('expected GitHub operation to reject')
}

describe('GitHubRestProvider repository search', () => {
  it('authenticates, sorts by stars, and maps repository facts', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            total_count: 3,
            incomplete_results: false,
            items: [
              {
                name: 'one',
                full_name: 'deepseek-ai/one',
                owner: { login: 'deepseek-ai' },
                html_url: 'https://github.com/deepseek-ai/one',
                description: 'first repository',
                stargazers_count: 30,
                forks_count: 4,
                open_issues_count: 2,
                archived: false,
                default_branch: 'main',
                pushed_at: '2026-08-17T00:00:00Z',
                topics: ['agents'],
                license: { spdx_id: 'MIT' },
                language: 'TypeScript',
              },
              {
                name: 'two',
                full_name: 'deepseek-ai/two',
                owner: { login: 'deepseek-ai' },
                html_url: 'https://github.com/deepseek-ai/two',
                description: null,
                stargazers_count: 20,
                forks_count: 3,
                open_issues_count: 1,
                archived: true,
                default_branch: 'master',
                pushed_at: '2026-08-16T00:00:00Z',
                topics: [],
                license: null,
                language: null,
              },
            ],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const provider = new GitHubRestProvider({
      resolveToken: () => Promise.resolve('github-token'),
      timeoutMs: 10_000,
    })

    const result = await provider.searchRepositories({ query: 'agent harness', limit: 2 })

    expect(result.repositories).toEqual([
      {
        ref: { owner: 'deepseek-ai', name: 'one' },
        fullName: 'deepseek-ai/one',
        url: 'https://github.com/deepseek-ai/one',
        description: 'first repository',
        stars: 30,
        forks: 4,
        openIssues: 2,
        archived: false,
        defaultBranch: 'main',
        pushedAt: '2026-08-17T00:00:00Z',
        topics: ['agents'],
        license: 'MIT',
        primaryLanguage: 'TypeScript',
      },
      {
        ref: { owner: 'deepseek-ai', name: 'two' },
        fullName: 'deepseek-ai/two',
        url: 'https://github.com/deepseek-ai/two',
        stars: 20,
        forks: 3,
        openIssues: 1,
        archived: true,
        defaultBranch: 'master',
        pushedAt: '2026-08-16T00:00:00Z',
        topics: [],
      },
    ])
    expect(result.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.truncated).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/search/repositories?')
    expect(url).toContain('sort=stars')
    expect(url).toContain('order=desc')
    expect(url).not.toContain('github-token')
    expect(new Headers(init.headers).get('authorization')).toContain('github-token')
  })

  it('reports the GitHub rate-limit reset without exposing the token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              message: 'API rate limit exceeded',
            }),
            {
              status: 403,
              headers: {
                'content-type': 'application/json',
                'x-ratelimit-remaining': '0',
                'x-ratelimit-reset': '1786924800',
              },
            },
          ),
      ),
    )
    const provider = new GitHubRestProvider({
      resolveToken: () => Promise.resolve('secret-github-token'),
      timeoutMs: 10_000,
    })

    const error = await githubErrorOf(provider.searchRepositories({ query: 'agent harness', limit: 1 }))

    expect(error).toBeInstanceOf(GitHubError)
    expect(error).toMatchObject({ code: 'GITHUB_RATE_LIMITED' })
    expect(error.message).toContain(new Date(1_786_924_800_000).toISOString())
    expect(error.message).not.toContain('secret-github-token')
  })

  it('classifies a rejected GitHub credential', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              message: 'Bad credentials',
            }),
            {
              status: 401,
              headers: { 'content-type': 'application/json' },
            },
          ),
      ),
    )
    const provider = new GitHubRestProvider({
      resolveToken: () => Promise.resolve('rejected-token'),
      timeoutMs: 10_000,
    })

    const error = await githubErrorOf(provider.searchRepositories({ query: 'agent harness', limit: 1 }))

    expect(error).toBeInstanceOf(GitHubError)
    expect(error).toMatchObject({ code: 'GITHUB_AUTHENTICATION_FAILED' })
    expect(error.message).not.toContain('rejected-token')
  })

  it('classifies an upstream GitHub failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              message: 'Server Error',
            }),
            {
              status: 503,
              headers: { 'content-type': 'application/json' },
            },
          ),
      ),
    )
    const provider = new GitHubRestProvider({
      resolveToken: () => Promise.resolve(undefined),
      timeoutMs: 10_000,
    })

    const error = await githubErrorOf(provider.searchRepositories({ query: 'agent harness', limit: 1 }))

    expect(error).toBeInstanceOf(GitHubError)
    expect(error).toMatchObject({ code: 'GITHUB_UPSTREAM_FAILED' })
  })

  it('forwards caller cancellation to the GitHub request', async () => {
    let requestSignal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined
        return await new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener(
            'abort',
            () => {
              reject(requestSignal?.reason instanceof Error ? requestSignal.reason : new Error('request aborted'))
            },
            { once: true },
          )
        })
      }),
    )
    const provider = new GitHubRestProvider({
      resolveToken: () => Promise.resolve(undefined),
      timeoutMs: 10_000,
    })
    const controller = new AbortController()

    const pending = provider.searchRepositories({ query: 'agent harness', limit: 1 }, controller.signal)
    await vi.waitFor(() => {
      expect(requestSignal).toBeDefined()
    })
    controller.abort(new Error('caller cancelled'))
    const error = await githubErrorOf(pending)

    expect(requestSignal?.aborted).toBe(true)
    expect(error).toBeInstanceOf(GitHubError)
    expect(error).toMatchObject({ code: 'GITHUB_REQUEST_CANCELLED' })
  })

  it('classifies the configured GitHub request timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const signal = init?.signal
        return await new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => {
              reject(signal.reason instanceof Error ? signal.reason : new Error('request aborted'))
            },
            { once: true },
          )
        })
      }),
    )
    const provider = new GitHubRestProvider({
      resolveToken: () => Promise.resolve(undefined),
      timeoutMs: 5,
    })

    const error = await githubErrorOf(provider.searchRepositories({ query: 'agent harness', limit: 1 }))

    expect(error).toBeInstanceOf(GitHubError)
    expect(error).toMatchObject({ code: 'GITHUB_REQUEST_TIMEOUT' })
  })
})
