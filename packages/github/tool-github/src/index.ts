/** Model-facing GitHub repository tools over `ctx.github`. @module @deepseek-ai/dsh-tool-github */

import type { Context } from '@deepseek-ai/cordis'
import type { GitHubRepository } from '@deepseek-ai/dsh-github'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, ValueSchemaSpec } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'

/** Maximum candidate count supported by one GitHub repository search. */
export const GITHUB_SEARCH_LIMIT = 30
/** Default cooperative timeout attached to each GitHub tool call. */
export const DEFAULT_GITHUB_TOOL_TIMEOUT_MS = 30_000

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-github'
/** Services required by the GitHub tool suite. */
export const inject = ['github', 'tools', 'systemPrompt']

/** GitHub tool configuration. */
export interface Config {
  /** Candidate cap for every search; must be from 1 through 30. */
  searchMaxResults?: number
  /** Cooperative timeout applied to each tool call. */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  searchMaxResults: z.number().step(1).min(1).max(GITHUB_SEARCH_LIMIT).default(GITHUB_SEARCH_LIMIT),
  timeoutMs: z.number().step(1).min(1).default(DEFAULT_GITHUB_TOOL_TIMEOUT_MS),
})

const repositorySchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    ref: {
      type: 'object' as const,
      required: true,
      additionalProperties: false,
      properties: {
        owner: { type: 'string' as const, required: true },
        name: { type: 'string' as const, required: true },
      },
    },
    fullName: { type: 'string' as const, required: true },
    url: { type: 'string' as const, required: true },
    description: { type: 'string' as const },
    stars: { type: 'number' as const, required: true },
    forks: { type: 'number' as const, required: true },
    openIssues: { type: 'number' as const, required: true },
    archived: { type: 'boolean' as const, required: true },
    defaultBranch: { type: 'string' as const, required: true },
    pushedAt: { type: 'string' as const },
    topics: { type: 'array' as const, required: true, items: { type: 'string' as const } },
    license: { type: 'string' as const },
    primaryLanguage: { type: 'string' as const },
  },
} as const satisfies ValueSchemaSpec

/**
 * Validate and normalize a repository search query.
 * @param args - model-supplied query argument.
 * @returns the trimmed non-empty query.
 */
export function parseSearchArgs(args: { query: string }): { query: string } {
  const query = args.query.trim()
  if (query.length === 0) throw new Error('query must be a non-empty string')
  return { query }
}

/**
 * Validate and normalize a repository reference.
 * @param args - model-supplied owner and repository name.
 * @returns the trimmed non-empty repository reference.
 */
export function parseReadArgs(args: { owner: string; name: string }): { owner: string; name: string } {
  const owner = args.owner.trim()
  const name = args.name.trim()
  if (owner.length === 0) throw new Error('owner must be a non-empty string')
  if (name.length === 0) throw new Error('name must be a non-empty string')
  return { owner, name }
}

/**
 * Render one structured tool value as canonical, readable JSON.
 * @param value - structured tool result.
 * @returns indented JSON for the model-visible result block.
 */
export function renderGitHubJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

/**
 * Build search-card presentation for repository discovery.
 * @param args - normalized search arguments.
 * @returns generic search-card render intent.
 */
export function presentSearchCall(args: { query: string }): GenericCallView {
  return { card: 'generic', kind: 'search', title: args.query, rawInput: args.query }
}

/**
 * Build generic-card presentation for a repository read.
 * @param args - normalized repository reference.
 * @returns generic repository-card render intent.
 */
export function presentReadCall(args: { owner: string; name: string }): GenericCallView {
  const ref = `${args.owner}/${args.name}`
  return { card: 'generic', title: ref, rawInput: ref }
}

function projectRepository(repository: GitHubRepository) {
  return {
    ref: { owner: repository.ref.owner, name: repository.ref.name },
    fullName: repository.fullName,
    url: repository.url,
    ...(repository.description === undefined ? {} : { description: repository.description }),
    stars: repository.stars,
    forks: repository.forks,
    openIssues: repository.openIssues,
    archived: repository.archived,
    defaultBranch: repository.defaultBranch,
    ...(repository.pushedAt === undefined ? {} : { pushedAt: repository.pushedAt }),
    topics: [...repository.topics],
    ...(repository.license === undefined ? {} : { license: repository.license }),
    ...(repository.primaryLanguage === undefined ? {} : { primaryLanguage: repository.primaryLanguage }),
  }
}

/** Register GitHub repository search and read tools. */
export function apply(ctx: Context, config: Config): void {
  const searchMaxResults = config.searchMaxResults ?? GITHUB_SEARCH_LIMIT
  const timeoutMs = config.timeoutMs ?? DEFAULT_GITHUB_TOOL_TIMEOUT_MS
  ctx.systemPrompt.section({
    name: 'tool:github',
    order: 112,
    text: 'Use github_search_repositories to discover github.com projects by descending star count. Use github_read_repository to inspect repository facts and README content. Treat observedAt as the data timestamp and cite repository URLs in research reports.',
  })

  ctx.tools.register(
    defineTool({
      name: 'github_search_repositories',
      description: 'Search github.com repositories by descending star count and return structured repository facts.',
      parameters: {
        query: { type: 'string', required: true, description: 'GitHub repository search query.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            repositories: { type: 'array', required: true, items: repositorySchema },
            observedAt: { type: 'string', required: true },
            truncated: { type: 'boolean', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: renderGitHubJson(value) }],
      },
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const input = parseSearchArgs(args)
        const result = await ctx.github.searchRepositories({ query: input.query, limit: searchMaxResults }, exec.signal)
        return {
          repositories: result.repositories.map(projectRepository),
          observedAt: result.observedAt,
          truncated: result.truncated,
        }
      },
      presentCall: presentSearchCall,
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'github_read_repository',
      description: 'Read structured github.com repository facts and its README when present.',
      parameters: {
        owner: { type: 'string', required: true, description: 'Repository owner.' },
        name: { type: 'string', required: true, description: 'Repository name.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            repository: { ...repositorySchema, required: true },
            readme: {
              type: 'object',
              required: true,
              additionalProperties: false,
              properties: {
                kind: { type: 'string', required: true, enum: ['text', 'missing'] },
                content: { type: 'string' },
                url: { type: 'string' },
              },
            },
            observedAt: { type: 'string', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: renderGitHubJson(value) }],
      },
      timeoutMs,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const ref = parseReadArgs(args)
        const result = await ctx.github.readRepository(ref, exec.signal)
        return {
          repository: projectRepository(result.repository),
          readme:
            result.readme.kind === 'missing'
              ? { kind: 'missing' as const }
              : {
                kind: 'text' as const,
                content: result.readme.content,
                ...(result.readme.url === undefined ? {} : { url: result.readme.url }),
              },
          observedAt: result.observedAt,
        }
      },
      presentCall: presentReadCall,
    }),
  )
}
