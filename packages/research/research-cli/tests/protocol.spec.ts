import { CriterionId, type ResearchBrief } from '@deepseek-ai/dsh-research'
import { handleResearchCliRequest, RESEARCH_CLI_PROTOCOL } from '@deepseek-ai/dsh-research-cli'
import { describe, expect, it } from 'vitest'

describe('research CLI protocol', () => {
  it('describes compatible operations without external work', async () => {
    const response = await handleResearchCliRequest(
      { protocol: RESEARCH_CLI_PROTOCOL, operation: 'describe' },
      {
        searchRepositories: () => Promise.reject(new Error('must not run')),
        readRepository: () => Promise.reject(new Error('must not run')),
        resolveRevision: () => Promise.reject(new Error('must not run')),
        listTree: () => Promise.reject(new Error('must not run')),
        readFiles: () => Promise.reject(new Error('must not run')),
      },
    )

    expect(response).toEqual({
      protocol: RESEARCH_CLI_PROTOCOL,
      operation: 'describe',
      result: { operations: ['collect', 'compile-report', 'render-html', 'evaluate'] },
    })
  })

  it('returns a versioned commit-pinned ledger through the standalone contract', async () => {
    const brief: ResearchBrief = {
      schema: 'zj-research-brief/v1',
      topic: 'Harness',
      criteria: [{ id: CriterionId('policy'), question: 'Policy?', critical: true, keywords: ['policy'] }],
      repositories: [{ owner: 'example', name: 'harness' }],
      policyVersion: 'v1',
    }
    const response = await handleResearchCliRequest(
      { protocol: RESEARCH_CLI_PROTOCOL, operation: 'collect', brief },
      {
        searchRepositories: () => Promise.resolve({ repositories: [] }),
        readRepository: ref =>
          Promise.resolve({
            repository: {
              ref,
              fullName: `${ref.owner}/${ref.name}`,
              url: 'repo-url',
              stars: 1,
              forks: 0,
              openIssues: 0,
              archived: false,
              defaultBranch: 'main',
              topics: [],
            },
            readme: { kind: 'missing' },
            observedAt: '2026-08-18T00:00:00.000Z',
          }),
        resolveRevision: () => Promise.resolve({ sha: 'abc123', branch: 'main', url: 'commit-url' }),
        listTree: () => Promise.resolve([{ path: 'architecture-policy.md', type: 'blob', sha: 'file123' }]),
        readFiles: () => Promise.resolve([{ path: 'architecture-policy.md', sha: 'file123', content: 'Policy is enforced.' }]),
      },
    )

    expect(response).toMatchObject({
      protocol: RESEARCH_CLI_PROTOCOL,
      operation: 'collect',
      result: { schema: 'zj-verified-evidence-ledger/v1', evidence: [{ revision: 'abc123' }] },
    })
  })

  it('derives offline HTML from zj-draft Markdown through the versioned contract', async () => {
    const markdown =
      '# Report\n\n## 1. Executive summary\nSummary.\n\n## 2. Key findings\nFinding. [[1]](https://example.com/source)\n\n## 3. Analysis & synthesis\nAnalysis.\n\n## 4. Information gaps & next steps\nNone.\n\n## 6. Source list\n1. [Primary source](https://example.com/source)\n'
    const response = await handleResearchCliRequest(
      { protocol: RESEARCH_CLI_PROTOCOL, operation: 'render-html', family: 'zj-draft/v1', markdown },
      {
        searchRepositories: () => Promise.reject(new Error('must not run')),
        readRepository: () => Promise.reject(new Error('must not run')),
        resolveRevision: () => Promise.reject(new Error('must not run')),
        listTree: () => Promise.reject(new Error('must not run')),
        readFiles: () => Promise.reject(new Error('must not run')),
      },
    )

    expect(response).toMatchObject({ protocol: RESEARCH_CLI_PROTOCOL, operation: 'render-html' })
    if (typeof response.result !== 'object' || response.result === null || !('html' in response.result)) throw new Error('missing HTML result')
    const { html } = response.result
    if (typeof html !== 'string') throw new Error('HTML result must be a string')
    expect(html).toContain('<h2>1. Executive summary</h2>')
    expect(html).toContain('<a href="https://example.com/source">[1]</a>')
    expect(html).toContain('<a href="https://example.com/source">Primary source</a>')
    expect(html).not.toContain('mermaid.initialize')
    expect(html).not.toMatch(/<(?:script|link)[^>]+(?:src|href)=["']https?:\/\//)
  })

  it('rejects Markdown that does not match the requested report family', async () => {
    await expect(
      handleResearchCliRequest(
        { protocol: RESEARCH_CLI_PROTOCOL, operation: 'render-html', family: 'technical-c4/v1', markdown: '# Report' },
        {
          searchRepositories: () => Promise.reject(new Error('must not run')),
          readRepository: () => Promise.reject(new Error('must not run')),
          resolveRevision: () => Promise.reject(new Error('must not run')),
          listTree: () => Promise.reject(new Error('must not run')),
          readFiles: () => Promise.reject(new Error('must not run')),
        },
      ),
    ).rejects.toThrow('research report is missing required heading: 调研主题')
  })

  it('rejects an incompatible protocol before external work', async () => {
    await expect(
      handleResearchCliRequest(
        { protocol: 'old' as typeof RESEARCH_CLI_PROTOCOL, operation: 'collect', brief: {} as ResearchBrief },
        {
          searchRepositories: () => Promise.reject(new Error('must not run')),
          readRepository: () => Promise.reject(new Error('must not run')),
          resolveRevision: () => Promise.reject(new Error('must not run')),
          listTree: () => Promise.resolve([]),
          readFiles: () => Promise.resolve([]),
        },
      ),
    ).rejects.toThrow('unsupported research CLI protocol')
  })
})
