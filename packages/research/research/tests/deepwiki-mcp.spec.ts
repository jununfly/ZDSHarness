import { DeepWikiMcpClient } from '@deepseek-ai/dsh-research'
import { describe, expect, it } from 'vitest'

describe('DeepWikiMcpClient', () => {
  it('maps only the two navigation operations to raw MCP tools', async () => {
    const calls: Array<{ name: string; args: Readonly<Record<string, unknown>> }> = []
    const client = new DeepWikiMcpClient({
      call: (name, args) => {
        calls.push({ name, args })
        return Promise.resolve({ content: [{ type: 'text', text: '`architecture-policy.md`' }] })
      },
    })

    await expect(client.readWikiStructure('example/harness')).resolves.toBe('`architecture-policy.md`')
    await expect(client.askQuestion('example/harness', 'Where is policy?')).resolves.toBe('`architecture-policy.md`')
    expect(calls).toEqual([
      { name: 'read_wiki_structure', args: { repoName: 'example/harness' } },
      { name: 'ask_question', args: { repoName: 'example/harness', question: 'Where is policy?' } },
    ])
  })

  it('rejects an MCP error instead of treating its prose as a path hint', async () => {
    const client = new DeepWikiMcpClient({
      call: () => Promise.resolve({ isError: true, content: [{ type: 'text', text: 'not indexed' }] }),
    })
    await expect(client.readWikiStructure('example/harness')).rejects.toThrow('not indexed')
  })
})
