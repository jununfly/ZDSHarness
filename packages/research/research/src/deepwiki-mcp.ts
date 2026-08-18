/** Internal DeepWiki MCP transport and client adapter. @module @deepseek-ai/dsh-research/deepwiki-mcp */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { z } from 'zod'
import type { DeepWikiClient } from './deepwiki-navigation.ts'

const RawToolResult = z.record(z.string(), z.unknown())

/** Deployment settings for the true-external DeepWiki MCP transport. */
export interface DeepWikiMcpOptions {
  readonly url: string
  readonly timeoutMs: number
}

/** Minimal tool-call port consumed by the DeepWiki navigation adapter. */
export interface DeepWikiToolClient {
  /** @returns the untrusted MCP tool result after protocol decoding. */
  call(name: string, args: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<Readonly<Record<string, unknown>>>
}

/** Streamable HTTP MCP client that never registers DeepWiki tools for the model. */
export class DeepWikiMcpToolClient implements DeepWikiToolClient {
  private clientPromise: Promise<Client> | undefined

  constructor(private readonly options: DeepWikiMcpOptions) {
    if (options.timeoutMs <= 0 || !Number.isSafeInteger(options.timeoutMs))
      throw new Error('DeepWiki MCP timeoutMs must be a positive safe integer')
    const url = new URL(options.url)
    if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')
      throw new Error('DeepWiki MCP URL must use HTTPS')
  }

  /** Call one raw DeepWiki MCP tool without publishing it to `ctx.tools`. */
  async call(name: string, args: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
    const client = await this.client()
    return await client.request({ method: 'tools/call', params: { name, arguments: args } }, RawToolResult, {
      timeout: this.options.timeoutMs,
      ...(signal === undefined ? {} : { signal }),
    })
  }

  /** Close the MCP generation and release its transport. */
  async close(): Promise<void> {
    if (this.clientPromise === undefined) return
    const client = await this.clientPromise
    this.clientPromise = undefined
    await client.close()
  }

  private client(): Promise<Client> {
    this.clientPromise ??= this.connect()
    return this.clientPromise
  }

  private async connect(): Promise<Client> {
    const client = new Client({ name: 'dsh-research-deepwiki', version: 'research/v1' }, { capabilities: {} })
    await client.connect(new StreamableHTTPClientTransport(new URL(this.options.url)) as Transport)
    return client
  }
}

/** Maps DeepWiki's MCP tools to navigation-only text operations. */
export class DeepWikiMcpClient implements DeepWikiClient {
  constructor(private readonly tools: DeepWikiToolClient) {}

  /** Read derived wiki structure for candidate-path extraction. */
  async readWikiStructure(repository: string, signal?: AbortSignal): Promise<string> {
    return textResult(await this.tools.call('read_wiki_structure', { repoName: repository }, signal), 'read_wiki_structure')
  }

  /** Ask a navigation question whose prose remains non-canonical. */
  async askQuestion(repository: string, question: string, signal?: AbortSignal): Promise<string> {
    return textResult(await this.tools.call('ask_question', { repoName: repository, question }, signal), 'ask_question')
  }
}

function textResult(result: Readonly<Record<string, unknown>>, tool: string): string {
  if (result.isError === true) throw new Error(`DeepWiki ${tool} failed: ${textBlocks(result.content).join('\n') || 'unknown error'}`)
  const text = textBlocks(result.content).join('\n')
  if (text.length === 0) throw new Error(`DeepWiki ${tool} returned no text content`)
  return text
}

function textBlocks(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter(isTextBlock).map(block => block.text)
}

function isTextBlock(value: unknown): value is { readonly type: 'text'; readonly text: string } {
  if (typeof value !== 'object' || value === null) return false
  if (!('type' in value) || !('text' in value)) return false
  const type: unknown = value.type
  const text: unknown = value.text
  return type === 'text' && typeof text === 'string'
}
