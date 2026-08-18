import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import GitHubRuntime from '@deepseek-ai/dsh-github'
import { CallId } from '@deepseek-ai/dsh-llm'
import { CriterionId } from '@deepseek-ai/dsh-research'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ToolResearch from '@deepseek-ai/dsh-tool-research'
import { describe, expect, it } from 'vitest'

describe('research_collect_evidence', () => {
  it('returns only commit-pinned canonical evidence and explicit unknowns', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(GitHubRuntime)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    ctx.github.registerProvider({
      id: 'fixture',
      available: () => true,
      searchRepositories: () => Promise.reject(new Error('not exposed by this Consumer')),
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
      readFiles: () => Promise.resolve([{ path: 'architecture-policy.md', sha: 'file123', content: 'Hooks enforce policy.' }]),
    })
    await ctx.plugin(ToolResearch)
    const session = ctx.sessions.create(SessionId('research-tool-test'))
    const agent = { session } as Agent

    const result = await ctx.tools.execute({
      callId: CallId('collect'),
      name: 'research_collect_evidence',
      arguments: {
        brief: {
          schema: 'zj-research-brief/v1',
          topic: 'Harness governance',
          criteria: [{ id: CriterionId('governance'), question: 'How is policy enforced?', critical: true, keywords: ['policy', 'hook'] }],
          repositories: [{ owner: 'example', name: 'harness' }],
          policyVersion: 'v1',
          budget: { maxFiles: 4, maxBytes: 1000 },
        },
      },
      agent,
      signal: new AbortController().signal,
    })

    expect(result.isError, JSON.stringify(result.content)).toBe(false)
    expect(result.value).toMatchObject({
      schema: 'zj-research-evidence-digest/v1',
      repositories: [{ revision: { sha: 'abc123' } }],
      evidence: [{ criterionId: 'governance', revision: 'abc123', kind: 'canonical' }],
      unknownCriteria: [],
    })
    if (typeof result.value !== 'object' || result.value === null) throw new Error('evidence digest must be an object')
    expect(typeof (result.value as { ledgerFingerprint?: unknown }).ledgerFingerprint).toBe('string')
    expect(result.value).not.toHaveProperty('repositories.0.tree')
    expect(ctx.tools.get('github_read_repository')).toBeUndefined()
    expect(session.events.find(event => event.type === 'research/evidence-collected')).toMatchObject({
      data: { ledger: { schema: 'zj-verified-evidence-ledger/v1' } },
    })

    const invalid = await ctx.tools.execute({
      callId: CallId('invalid-collect'),
      name: 'research_collect_evidence',
      arguments: {
        brief: {
          schema: 'zj-research-brief/v1',
          researchQuestion: 'Invented field from an underspecified tool schema.',
          repositories: { explicit: ['example/harness'] },
          budgets: { maxFilesPerRepository: 3 },
        },
      },
      agent,
      signal: new AbortController().signal,
    })
    expect(invalid.isError).toBe(true)
    expect(JSON.stringify(invalid.content)).toContain('brief.topic')
  })
})
