import { describe, expect, it, vi } from 'vitest'
import {
  CriterionId,
  DeepWikiResearchNavigator,
  EvidenceCompiler,
  HeuristicResearchNavigator,
  researchBriefFingerprint,
  type ResearchBrief,
} from '@deepseek-ai/dsh-research'

const brief: ResearchBrief = {
  schema: 'zj-research-brief/v1',
  topic: 'Harness engineering for a one-hundred-person team',
  criteria: [
    { id: CriterionId('governance'), question: 'How are policies enforced?', critical: true, keywords: ['policy', 'hook'] },
    { id: CriterionId('evaluation'), question: 'How is quality evaluated?', critical: true, keywords: ['evaluation'] },
  ],
  repositories: [{ owner: 'example', name: 'harness' }],
  policyVersion: '2026-08-18',
  budget: { maxFiles: 4, maxBytes: 20_000 },
}

describe('EvidenceCompiler', () => {
  it('pins every canonical read to the resolved revision and preserves uncovered criteria as unknown', async () => {
    const reads: Array<{ revision: string; paths: readonly string[] }> = []
    const compiler = new EvidenceCompiler({
      searchRepositories: () => Promise.resolve({ repositories: [] }),
      readRepository: ref => Promise.resolve(repositoryResult(ref)),
      resolveRevision: () => Promise.resolve({ sha: 'abc123', branch: 'main', url: 'https://github.com/example/harness/commit/abc123' }),
      listTree: (_ref, revision) => {
        expect(revision).toBe('abc123')
        return Promise.resolve([
          { path: 'architecture-policy.md', type: 'blob', sha: 'policy-file', size: 80 },
          { path: 'README.md', type: 'blob', sha: 'readme-file', size: 40 },
        ])
      },
      readFiles: (request) => {
        reads.push({ revision: request.revision, paths: request.paths })
        return Promise.resolve(
          request.paths.map(path =>
            path === 'architecture-policy.md'
              ? {
                path,
                sha: 'policy-file',
                content: '# Policy\n\nHooks enforce repository policy.',
                htmlUrl: 'https://github.com/example/harness/blob/abc123/architecture-policy.md',
              }
              : { path, sha: 'readme-file', content: '# Harness' },
          ),
        )
      },
    })

    const ledger = await compiler.collect(compiler.resolve(brief))

    expect(reads).toEqual([
      { revision: 'abc123', paths: ['architecture-policy.md'] },
      { revision: 'abc123', paths: ['README.md'] },
    ])
    expect(ledger.briefFingerprint).toBe(researchBriefFingerprint(brief))
    expect(ledger.evidence).toEqual([expect.objectContaining({ criterionId: 'governance', revision: 'abc123', kind: 'canonical' })])
    expect(ledger.unknownCriteria).toEqual([{ criterionId: 'evaluation', repository: { owner: 'example', name: 'harness' } }])
  })

  it('rejects an unsupported brief version before repository access', async () => {
    const resolveRevision = () => Promise.reject(new Error('must not be called'))
    const compiler = new EvidenceCompiler({
      searchRepositories: () => Promise.resolve({ repositories: [] }),
      readRepository: ref => Promise.resolve(repositoryResult(ref)),
      resolveRevision,
      listTree: () => Promise.resolve([]),
      readFiles: () => Promise.resolve([]),
    })

    expect(() => compiler.resolve({ ...brief, schema: 'old' as ResearchBrief['schema'] })).toThrow('unsupported research brief schema')
  })

  it('uses DeepWiki only for navigation and degrades to canonical heuristic reads when it fails', async () => {
    const deepwiki = new DeepWikiResearchNavigator(
      {
        readWikiStructure: () => Promise.reject(new Error('DeepWiki unavailable')),
        askQuestion: () => Promise.reject(new Error('must not be called')),
      },
      () => true,
    )
    const compiler = new EvidenceCompiler(
      {
        searchRepositories: () => Promise.resolve({ repositories: [] }),
        readRepository: ref => Promise.resolve(repositoryResult(ref)),
        resolveRevision: () => Promise.resolve({ sha: 'abc123', branch: 'main', url: 'https://github.com/example/harness/commit/abc123' }),
        listTree: () => Promise.resolve([{ path: 'architecture-policy.md', type: 'blob', sha: 'policy-file' }]),
        readFiles: () => Promise.resolve([{ path: 'architecture-policy.md', sha: 'policy-file', content: 'Hooks enforce policy.' }]),
      },
      [deepwiki, new HeuristicResearchNavigator()],
    )

    const ledger = await compiler.collect(compiler.resolve(brief))

    expect(ledger.evidence).toEqual([expect.objectContaining({ criterionId: 'governance', kind: 'canonical' })])
    expect(ledger.navigation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ adapter: 'deepwiki', status: 'failed', message: 'DeepWiki unavailable' }),
        expect.objectContaining({ adapter: 'heuristic', status: 'used' }),
      ]),
    )
  })

  it('discovers candidates, keeps stars separate from topic match, and reuses an exact revision cache entry', async () => {
    let treeReads = 0
    const discoveredBrief: ResearchBrief = {
      ...brief,
      repositories: [],
      discovery: { query: 'agent harness', limit: 2, topicKeywords: ['agent', 'governance'] },
    }
    const compiler = new EvidenceCompiler({
      searchRepositories: () =>
        Promise.resolve({
          repositories: [
            repository({ owner: 'popular', name: 'generic' }, 10_000, ['agent']),
            repository({ owner: 'focused', name: 'harness' }, 100, ['agent', 'governance']),
          ],
        }),
      readRepository: ref => Promise.resolve(repositoryResult(ref)),
      resolveRevision: ref => Promise.resolve({ sha: `${ref.owner}-sha`, branch: 'main', url: 'commit-url' }),
      listTree: () => {
        treeReads += 1
        return Promise.resolve([{ path: 'README.md', type: 'blob', sha: 'readme' }])
      },
      readFiles: request =>
        Promise.resolve([{ path: 'README.md', sha: 'readme', content: `${request.ref.owner} agent governance policy` }]),
    })

    const first = await compiler.collect(compiler.resolve(discoveredBrief))
    const second = await compiler.collect(compiler.resolve(discoveredBrief))

    expect(first.candidates).toEqual([
      { repository: { owner: 'focused', name: 'harness' }, stars: 100, topicMatch: 100, origin: 'discovered' },
      { repository: { owner: 'popular', name: 'generic' }, stars: 10_000, topicMatch: 50, origin: 'discovered' },
    ])
    expect(second).toMatchObject({
      briefFingerprint: first.briefFingerprint,
      collection: { filesRead: 0, sourceBytesRead: 0, cacheHit: true },
    })
    expect(treeReads).toBe(2)
  })

  it('stops canonical reads at the deadline and retains uncovered criteria as unknown', async () => {
    let now = 0
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
    const readFiles = vi.fn(() => Promise.resolve([]))
    const compiler = new EvidenceCompiler({
      searchRepositories: () => Promise.resolve({ repositories: [] }),
      readRepository: ref => Promise.resolve(repositoryResult(ref)),
      resolveRevision: () => Promise.resolve({ sha: 'abc123', branch: 'main', url: 'commit-url' }),
      listTree: () => {
        now = 2
        return Promise.resolve([{ path: 'README.md', type: 'blob', sha: 'readme' }])
      },
      readFiles,
    })

    try {
      const ledger = await compiler.collect(compiler.resolve({ ...brief, budget: { maxFiles: 4, maxBytes: 20_000, deadlineMs: 1 } }))

      expect(readFiles).not.toHaveBeenCalled()
      expect(ledger.unknownCriteria).toEqual([
        { criterionId: 'governance', repository: { owner: 'example', name: 'harness' } },
        { criterionId: 'evaluation', repository: { owner: 'example', name: 'harness' } },
      ])
      expect(ledger.navigation).toContainEqual({
        adapter: 'compiler',
        repository: { owner: 'example', name: 'harness' },
        status: 'failed',
        message: 'research collection deadline exceeded',
      })
    } finally {
      clock.mockRestore()
    }
  })

  it('allocates the complete-run file budget fairly across repositories', async () => {
    const repositories = ['first', 'second', 'third'].map(owner => ({ owner, name: 'harness' }))
    const reads: string[] = []
    const compiler = new EvidenceCompiler({
      searchRepositories: () => Promise.resolve({ repositories: [] }),
      readRepository: ref => Promise.resolve(repositoryResult(ref)),
      resolveRevision: ref => Promise.resolve({ sha: `${ref.owner}-sha`, branch: 'main', url: 'commit-url' }),
      listTree: () => Promise.resolve([{ path: 'README.md', type: 'blob', sha: 'readme' }]),
      readFiles: (request) => {
        reads.push(request.ref.owner)
        return Promise.resolve([{ path: 'README.md', sha: 'readme', content: 'agent policy evaluation team sandbox' }])
      },
    })

    const ledger = await compiler.collect(compiler.resolve({ ...brief, repositories, budget: { maxFiles: 3, maxBytes: 30_000 } }))

    expect(reads).toEqual(['first', 'second', 'third'])
    expect(ledger.repositories).toHaveLength(3)
    expect(ledger.evidence.map(item => item.repository.owner)).toEqual(expect.arrayContaining(['first', 'second', 'third']))
  })

  it('keeps one canonical excerpt per repository criterion when one read returns several matching files', async () => {
    const compiler = new EvidenceCompiler({
      searchRepositories: () => Promise.resolve({ repositories: [] }),
      readRepository: ref => Promise.resolve(repositoryResult(ref)),
      resolveRevision: () => Promise.resolve({ sha: 'abc123', branch: 'main', url: 'commit-url' }),
      listTree: () => Promise.resolve([
        { path: 'architecture-policy-a.md', type: 'blob', sha: 'a' },
        { path: 'architecture-policy-b.md', type: 'blob', sha: 'b' },
      ]),
      readFiles: request => Promise.resolve(request.paths.map(path => ({ path, sha: path, content: 'Policy hooks and evaluation.' }))),
    })

    const ledger = await compiler.collect(compiler.resolve(brief))

    expect(ledger.evidence).toHaveLength(2)
    expect(ledger.evidence.map(item => item.criterionId)).toEqual(['governance', 'evaluation'])
  })
})

function repository(ref: { owner: string; name: string }, stars = 1, topics: readonly string[] = []) {
  return {
    ref,
    fullName: `${ref.owner}/${ref.name}`,
    url: `https://github.com/${ref.owner}/${ref.name}`,
    stars,
    forks: 0,
    openIssues: 0,
    archived: false,
    defaultBranch: 'main',
    topics,
  }
}

function repositoryResult(ref: { owner: string; name: string }) {
  return { repository: repository(ref), readme: { kind: 'missing' as const }, observedAt: '2026-08-18T00:00:00.000Z' }
}
