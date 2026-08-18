import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitHubError } from '@deepseek-ai/dsh-github'
import { GitHubRestProvider } from '@deepseek-ai/dsh-github-rest'

afterEach(() => {
  vi.unstubAllGlobals()
})

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input
  return input instanceof URL ? input.href : input.url
}

async function githubErrorOf(promise: Promise<unknown>): Promise<GitHubError> {
  try {
    await promise
  } catch (error: unknown) {
    if (error instanceof GitHubError) return error
    throw error
  }
  throw new Error('expected GitHub operation to reject')
}

describe('GitHubRestProvider repository reads', () => {
  it('pins tree and file reads to the resolved default-branch commit', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = requestUrl(input)
      if (url.endsWith('/repos/deepseek-ai/example')) {
        return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url.endsWith('/repos/deepseek-ai/example/branches/main')) {
        return new Response(
          JSON.stringify({ commit: { sha: 'abc123', html_url: 'https://github.com/deepseek-ai/example/commit/abc123' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url.includes('/repos/deepseek-ai/example/git/trees/abc123')) {
        return new Response(
          JSON.stringify({ truncated: false, tree: [{ path: 'POLICY.md', mode: '100644', type: 'blob', sha: 'file123', size: 42 }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url.includes('/repos/deepseek-ai/example/contents/POLICY.md')) {
        return new Response(
          JSON.stringify({
            type: 'file',
            path: 'POLICY.md',
            sha: 'file123',
            encoding: 'base64',
            content: Buffer.from('Hooks enforce policy.').toString('base64'),
            html_url: 'https://github.com/deepseek-ai/example/blob/abc123/POLICY.md',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const provider = new GitHubRestProvider({ resolveToken: () => Promise.resolve(undefined), timeoutMs: 10_000 })
    const ref = { owner: 'deepseek-ai', name: 'example' }

    const revision = await provider.resolveRevision(ref)
    const tree = await provider.listTree(ref, revision.sha)
    const files = await provider.readFiles({ ref, revision: revision.sha, paths: ['POLICY.md'], maxBytes: 100 })

    expect(revision).toEqual({ sha: 'abc123', branch: 'main', url: 'https://github.com/deepseek-ai/example/commit/abc123' })
    expect(tree).toEqual([{ path: 'POLICY.md', type: 'blob', sha: 'file123', size: 42 }])
    expect(files).toEqual([
      {
        path: 'POLICY.md',
        sha: 'file123',
        content: 'Hooks enforce policy.',
        htmlUrl: 'https://github.com/deepseek-ai/example/blob/abc123/POLICY.md',
      },
    ])
    expect(fetchMock.mock.calls.map(call => requestUrl(call[0]))).toEqual(expect.arrayContaining([expect.stringContaining('ref=abc123')]))
  })

  it('rejects a file batch whose complete UTF-8 content exceeds the requested byte bound', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: 'file',
              sha: 'file123',
              encoding: 'base64',
              content: Buffer.from('four bytes').toString('base64'),
              html_url: null,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    )
    const provider = new GitHubRestProvider({ resolveToken: () => Promise.resolve(undefined), timeoutMs: 10_000 })

    const error = await githubErrorOf(
      provider.readFiles({ ref: { owner: 'deepseek-ai', name: 'example' }, revision: 'abc123', paths: ['README.md'], maxBytes: 4 }),
    )

    expect(error).toMatchObject({ code: 'GITHUB_FILES_TOO_LARGE' })
  })

  it('returns repository facts and decoded README text', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = requestUrl(input)
      if (url.endsWith('/repos/deepseek-ai/example')) {
        return new Response(
          JSON.stringify({
            name: 'example',
            full_name: 'deepseek-ai/example',
            owner: { login: 'deepseek-ai' },
            html_url: 'https://github.com/deepseek-ai/example',
            description: 'example repository',
            stargazers_count: 42,
            forks_count: 5,
            open_issues_count: 3,
            archived: false,
            default_branch: 'main',
            pushed_at: '2026-08-17T00:00:00Z',
            topics: ['research'],
            license: { spdx_id: 'Apache-2.0' },
            language: 'TypeScript',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url.endsWith('/repos/deepseek-ai/example/readme')) {
        return new Response(
          JSON.stringify({
            content: Buffer.from('# Example\n\nResearch agent.\n').toString('base64'),
            encoding: 'base64',
            html_url: 'https://github.com/deepseek-ai/example/blob/main/README.md',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response('not found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const provider = new GitHubRestProvider({
      resolveToken: () => Promise.resolve(undefined),
      timeoutMs: 10_000,
    })

    const result = await provider.readRepository({ owner: 'deepseek-ai', name: 'example' })

    expect(result.repository).toMatchObject({
      ref: { owner: 'deepseek-ai', name: 'example' },
      stars: 42,
      license: 'Apache-2.0',
    })
    expect(result.readme).toEqual({
      kind: 'text',
      content: '# Example\n\nResearch agent.\n',
      url: 'https://github.com/deepseek-ai/example/blob/main/README.md',
    })
    expect(result.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('returns repository facts when the repository has no README', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = requestUrl(input)
        if (url.endsWith('/repos/deepseek-ai/empty')) {
          return new Response(
            JSON.stringify({
              name: 'empty',
              full_name: 'deepseek-ai/empty',
              owner: { login: 'deepseek-ai' },
              html_url: 'https://github.com/deepseek-ai/empty',
              description: null,
              stargazers_count: 0,
              forks_count: 0,
              open_issues_count: 0,
              archived: false,
              default_branch: 'main',
              pushed_at: null,
              topics: [],
              license: null,
              language: null,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
    const provider = new GitHubRestProvider({
      resolveToken: () => Promise.resolve(undefined),
      timeoutMs: 10_000,
    })

    const result = await provider.readRepository({ owner: 'deepseek-ai', name: 'empty' })

    expect(result.repository.fullName).toBe('deepseek-ai/empty')
    expect(result.readme).toEqual({ kind: 'missing' })
  })

  it('classifies a missing repository separately from a missing README', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'Not Found' }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const provider = new GitHubRestProvider({
      resolveToken: () => Promise.resolve(undefined),
      timeoutMs: 10_000,
    })

    const error = await githubErrorOf(provider.readRepository({ owner: 'deepseek-ai', name: 'absent' }))

    expect(error).toBeInstanceOf(GitHubError)
    expect(error).toMatchObject({ code: 'GITHUB_REPOSITORY_NOT_FOUND' })
    expect(error.message).toContain('deepseek-ai/absent')
  })
})
