/** Model-facing Consumer for one bounded multi-repository evidence compilation. @module @deepseek-ai/dsh-tool-research */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  DeepWikiMcpClient,
  DeepWikiMcpToolClient,
  DeepWikiResearchNavigator,
  EvidenceCompiler,
  HeuristicResearchNavigator,
  type ResearchBrief,
  type ResearchEvidenceDigest,
  type ResearchNavigator,
} from '@deepseek-ai/dsh-research'
import type {} from '@deepseek-ai/dsh-github'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-research'
/** Services required by the evidence compilation tool. */
export const inject = ['github', 'tools', 'systemPrompt']
/** Internal DeepWiki navigation settings; canonical reads always remain on GitHub. */
export interface Config {
  /** Streamable HTTP MCP endpoint; omission disables DeepWiki navigation. */
  deepWikiUrl?: string
  /** Per-call DeepWiki MCP timeout. */
  deepWikiTimeoutMs?: number
  /** Exact public repositories allowed to leave the GitHub source adapter. */
  externalNavigationRepositories?: string[]
}

export const Config: z<Config> = z.object({
  deepWikiUrl: z.string(),
  deepWikiTimeoutMs: z.number().step(1).min(1).default(10_000),
  externalNavigationRepositories: z.array(z.string()).default([]),
})

const researchBriefSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schema: {
      type: 'string',
      const: 'zj-research-brief/v1',
      required: true,
      description: 'Research brief schema version.',
    },
    topic: {
      type: 'string',
      required: true,
      description: 'Decision question or technical topic shared by every candidate.',
    },
    criteria: {
      type: 'array',
      required: true,
      description: 'Shared evidence questions applied to every repository.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true, description: 'Unique stable criterion id.' },
          question: { type: 'string', required: true, description: 'Question canonical evidence must answer.' },
          critical: { type: 'boolean', required: true, description: 'Whether report claims for this criterion require evidence.' },
          keywords: {
            type: 'array',
            required: true,
            items: { type: 'string' },
            description: 'Terms used to select relevant commit-pinned files.',
          },
        },
      },
    },
    repositories: {
      type: 'array',
      required: true,
      description: 'Explicit repositories included in the comparison.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          owner: { type: 'string', required: true },
          name: { type: 'string', required: true },
        },
      },
    },
    discovery: {
      type: 'object',
      additionalProperties: false,
      description: 'Optional deterministic GitHub candidate discovery.',
      properties: {
        query: { type: 'string', required: true, description: 'GitHub repository search query.' },
        limit: { type: 'integer', required: true, description: 'Maximum discovered candidates.' },
        topicKeywords: {
          type: 'array',
          required: true,
          items: { type: 'string' },
          description: 'Terms used to score task-specific topic match.',
        },
      },
    },
    policyVersion: {
      type: 'string',
      required: true,
      description: 'Caller-owned evidence policy identifier retained in the sealed ledger.',
    },
    budget: {
      type: 'object',
      additionalProperties: false,
      description: 'Optional bounded canonical-read budget.',
      properties: {
        maxFiles: { type: 'integer', description: 'Maximum canonical files across all repositories.' },
        maxBytes: { type: 'integer', description: 'Maximum canonical source bytes across all repositories.' },
        deadlineMs: { type: 'integer', description: 'Maximum evidence collection duration in milliseconds.' },
      },
    },
  },
} as const

/** Register `research_collect_evidence`. */
export function apply(ctx: Context, config: Config): void {
  const navigators: ResearchNavigator[] = [new HeuristicResearchNavigator()]
  if (config.deepWikiUrl !== undefined) {
    const tools = new DeepWikiMcpToolClient({ url: config.deepWikiUrl, timeoutMs: config.deepWikiTimeoutMs ?? 10_000 })
    const allowed = new Set((config.externalNavigationRepositories ?? []).map(value => value.toLowerCase()))
    navigators.unshift(
      new DeepWikiResearchNavigator(new DeepWikiMcpClient(tools), repository =>
        allowed.has(`${repository.owner}/${repository.name}`.toLowerCase()),
      ),
    )
    ctx.effect(
      () => async () => {
        await tools.close()
      },
      'tool-research: DeepWiki MCP transport',
    )
  }
  const compiler = new EvidenceCompiler(ctx.github, navigators)
  ctx.systemPrompt.section({
    name: 'tool:research',
    order: 113,
    text: 'Use research_collect_evidence once with a complete multi-repository zj-research-brief/v1. Supply explicit repositories, deterministic discovery, or both. The result is a bounded digest of a complete sealed ledger retained by the application. Copy ledgerFingerprint, stars, and topicMatch into Report IR. Treat returned evidence as canonical. Treat unknownCriteria as unknown, never as proof that a repository lacks a capability. Do not ask for raw repository files or reproduce the sealed ledger in prepare_research_report.',
  })
  ctx.tools.register(
    defineTool({
      name: 'research_collect_evidence',
      description:
        'Discover candidates, pin repository revisions, retain a sealed canonical ledger, and return its bounded model-facing evidence digest.',
      parameters: {
        brief: {
          ...researchBriefSchema,
          required: true,
          description:
            'Complete zj-research-brief/v1 object with explicit repositories or discovery, shared criteria, policy version, and budgets.',
        },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const spec = compiler.resolve(args.brief as unknown as ResearchBrief)
        const ledger = await compiler.collect(spec, exec.signal)
        exec.agent?.session.append('research/evidence-collected', { ledger })
        const digest: ResearchEvidenceDigest = {
          schema: 'zj-research-evidence-digest/v1',
          compilerVersion: ledger.compilerVersion,
          ledgerFingerprint: ledger.briefFingerprint,
          policyVersion: ledger.policyVersion,
          observedAt: ledger.observedAt,
          repositories: ledger.repositories.map(item => ({ repository: item.repository, revision: item.revision })),
          candidates: ledger.candidates,
          evidence: ledger.evidence,
          unknownCriteria: ledger.unknownCriteria,
          navigation: ledger.navigation,
          collection: ledger.collection,
        }
        return digest as unknown as Record<string, JsonValue>
      },
      presentCall: () => ({ card: 'generic', title: 'Compile research evidence' }),
    }),
  )
}
