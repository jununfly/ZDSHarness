/** Deterministic GitHub provider for the keyless research-flow snapshot. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-github'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tech-research-github-fixture'
/** GitHub registry receiving the fixture provider. */
export const inject = ['github']

/** Register deterministic repository evidence. */
export function apply(ctx: Context): void {
  ctx.github.registerProvider({
    id: 'tech-research-fixture',
    available: () => true,
    searchRepositories: () =>
      Promise.resolve({
        repositories: [
          {
            ref: { owner: 'deepseek-ai', name: 'example-harness' },
            fullName: 'deepseek-ai/example-harness',
            url: 'https://github.com/deepseek-ai/example-harness',
            description: 'Plugin-based agent harness',
            stars: 420,
            forks: 21,
            openIssues: 4,
            archived: false,
            defaultBranch: 'main',
            pushedAt: '2026-08-16T00:00:00Z',
            topics: ['agents', 'harness'],
            license: 'MIT',
            primaryLanguage: 'TypeScript',
          },
        ],
        observedAt: '2026-08-17T00:00:00.000Z',
        truncated: false,
      }),
    readRepository: () =>
      Promise.resolve({
        repository: {
          ref: { owner: 'deepseek-ai', name: 'example-harness' },
          fullName: 'deepseek-ai/example-harness',
          url: 'https://github.com/deepseek-ai/example-harness',
          description: 'Plugin-based agent harness',
          stars: 420,
          forks: 21,
          openIssues: 4,
          archived: false,
          defaultBranch: 'main',
          pushedAt: '2026-08-16T00:00:00Z',
          topics: ['agents', 'harness'],
          license: 'MIT',
          primaryLanguage: 'TypeScript',
        },
        readme: {
          kind: 'text',
          content: '# Example Harness\n\nA plugin-based agent harness.\n',
          url: 'https://github.com/deepseek-ai/example-harness/blob/main/README.md',
        },
        observedAt: '2026-08-17T00:00:00.000Z',
      }),
    resolveRevision: () =>
      Promise.resolve({ sha: 'abc123', branch: 'main', url: 'https://github.com/deepseek-ai/example-harness/commit/abc123' }),
    listTree: () => Promise.resolve([{ path: 'docs/cordis-tutorial/01-first-plugin.md', type: 'blob', sha: 'file123', size: 64 }]),
    readFiles: () =>
      Promise.resolve([
        {
          path: 'docs/cordis-tutorial/01-first-plugin.md',
          sha: 'file123',
          content: '# Architecture\n\nA plugin-based agent harness enforces policy through plugins.',
          htmlUrl: 'https://github.com/deepseek-ai/example-harness/blob/abc123/docs/cordis-tutorial/01-first-plugin.md',
        },
      ]),
  })
}
