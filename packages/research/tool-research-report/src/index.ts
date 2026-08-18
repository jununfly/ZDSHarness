/** Markdown-first research report publisher with an offline HTML projection. @module @deepseek-ai/dsh-tool-research-report */

import { createHash, randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView } from '@deepseek-ai/dsh-tools'
import {
  compileResearchMarkdown,
  evaluateResearchPublication,
  researchHealthProjectionDefinition,
  ResearchReportValidationError,
} from '@deepseek-ai/dsh-research'
import type { ResearchReportIr, VerifiedEvidenceLedger } from '@deepseek-ai/dsh-research'
import { renderResearchHtml } from '@deepseek-ai/dsh-research-report'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-research-report'
/** Services required by the report publishing tool. */
export const inject = ['fs', 'tools', 'systemPrompt']

/** No tunable configuration: publication is deterministic for a fixed package version. */
export interface Config {}

/** Stable report publication failure with a machine-routable code. */
export class ResearchReportError extends HarnessError {}

/**
 * Validate the Markdown output path and derive its HTML sibling.
 * @param outputPath - requested Markdown destination.
 * @returns the Markdown path and same-name HTML path.
 */
export function resolveReportPaths(outputPath: string): { markdownPath: string; htmlPath: string } {
  const markdownPath = outputPath.trim()
  if (!markdownPath.toLowerCase().endsWith('.md')) {
    throw new Error('outputPath must name a Markdown file ending in .md')
  }
  return { markdownPath, htmlPath: `${markdownPath.slice(0, -3)}.html` }
}

interface PreparedPublication {
  state: 'validated' | 'publishing' | 'published' | 'failed'
  readonly markdown: string
  readonly html: string
  readonly paths: { markdownPath: string; htmlPath: string }
  readonly reportHash: string
  readonly report: ResearchReportIr
  readonly ledger: VerifiedEvidenceLedger
}

const repositoryRefSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    owner: { type: 'string', required: true },
    name: { type: 'string', required: true },
  },
} as const

const researchReportSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schema: { type: 'string', const: 'zj-research-report-ir/v1', required: true },
    family: { type: 'string', enum: ['technical-c4/v1', 'zj-draft/v1'], required: true },
    title: { type: 'string', required: true },
    summary: { type: 'string', required: true },
    ledgerFingerprint: { type: 'string', required: true, description: 'ledgerFingerprint from the research_collect_evidence digest.' },
    concepts: {
      type: 'array', required: true,
      items: { type: 'object', additionalProperties: false, properties: {
        key: { type: 'string', required: true },
        value: { type: 'string', required: true },
      } },
    },
    diagrams: {
      type: 'array', required: true,
      items: { type: 'object', additionalProperties: false, properties: {
        title: { type: 'string', required: true },
        kind: { type: 'string', enum: ['landscape', 'container', 'topic'], required: true },
        mermaid: { type: 'string', required: true },
      } },
    },
    candidates: {
      type: 'array', required: true,
      items: { type: 'object', additionalProperties: false, properties: {
        repository: { ...repositoryRefSchema, required: true },
        stars: { type: 'integer', required: true },
        topicMatch: { type: 'number', required: true },
        evidenceIds: { type: 'array', required: true, items: { type: 'string' } },
      } },
    },
    cards: {
      type: 'array', required: true,
      items: { type: 'object', additionalProperties: false, properties: {
        title: { type: 'string', required: true },
        summary: { type: 'string', required: true },
        claimIds: { type: 'array', required: true, items: { type: 'string' } },
      } },
    },
    claims: {
      type: 'array', required: true,
      items: { type: 'object', additionalProperties: false, properties: {
        id: { type: 'string', required: true },
        text: { type: 'string', required: true },
        critical: { type: 'boolean', required: true },
        evidenceIds: { type: 'array', required: true, items: { type: 'string' } },
      } },
    },
    comparisons: {
      type: 'array', required: true,
      items: { type: 'object', additionalProperties: false, properties: {
        id: { type: 'string', required: true },
        text: { type: 'string', required: true },
        claimIds: { type: 'array', required: true, items: { type: 'string' } },
      } },
    },
    recommendations: {
      type: 'array', required: true,
      items: { type: 'object', additionalProperties: false, properties: {
        id: { type: 'string', required: true },
        text: { type: 'string', required: true },
        comparisonIds: { type: 'array', required: true, items: { type: 'string' } },
      } },
    },
    metrics: {
      type: 'array', required: true,
      items: { type: 'object', additionalProperties: false, properties: {
        key: { type: 'string', required: true },
        definition: { type: 'string', required: true },
        unit: { type: 'string', required: true },
        method: { type: 'string', required: true },
        condition: { type: 'string', required: true },
        expected: { type: 'string', required: true },
      } },
    },
  },
} as const

/**
 * Build a generic validation card with the requested artifact locations.
 * @param args - prepare call arguments containing the Markdown destination.
 * @returns generic tool card for the Markdown and derived HTML paths.
 */
export function presentPrepareCall(args: { outputPath: string }): GenericCallView {
  const paths = resolveReportPaths(args.outputPath)
  return {
    card: 'generic',
    title: `Validate ${paths.markdownPath}`,
    rawInput: paths.markdownPath,
    locations: [{ path: paths.markdownPath }, { path: paths.htmlPath }],
  }
}

/** Register Report IR validation and single-use publication tools. */
export function apply(ctx: Context): void {
  const prepared = new Map<string, PreparedPublication>()
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.register(researchHealthProjectionDefinition)
  })
  ctx.systemPrompt.section({
    name: 'tool:research-report',
    order: 114,
    text: 'After research_collect_evidence succeeds, submit complete Report IR and outputPath to prepare_research_report; the application uses the sealed ledger already recorded in this session. Fix returned diagnostics by preparing again. Call publish_research_report exactly once with the validated token. Do not state paths, hashes, counts, timing, token use, or health facts yourself; the application returns those facts.',
  })
  ctx.tools.register(
    defineTool({
      name: 'prepare_research_report',
      description: 'Compile and validate evidence-linked Report IR without writing files.',
      parameters: {
        report: { ...researchReportSchema, required: true, description: 'Complete zj-research-report-ir/v1 object.' },
        outputPath: { type: 'string', required: true, description: 'Destination .md path; the .html sibling is derived automatically.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            status: { type: 'string', required: true },
            diagnostics: { type: 'array', items: { type: 'string' } },
            validationToken: { type: 'string' },
            reportHash: { type: 'string' },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const paths = resolveReportPaths(args.outputPath)
        try {
          const report = args.report as unknown as ResearchReportIr
          const evidenceEvent = exec.agent?.session.events.findLast(event => event.type === 'research/evidence-collected')
          if (evidenceEvent === undefined) throw new Error('prepare_research_report requires research_collect_evidence to succeed first in this session')
          const ledger: VerifiedEvidenceLedger = evidenceEvent.data.ledger
          const markdown = compileResearchMarkdown(report, ledger)
          const html = await renderResearchHtml(markdown, report.family)
          const reportHash = createHash('sha256').update(markdown).digest('hex')
          const validationToken = randomUUID()
          prepared.set(validationToken, { state: 'validated', markdown, html, paths, reportHash, report, ledger })
          exec.agent?.session.append('research/report-prepared', {
            status: 'validated',
            outputPath: paths.markdownPath,
            reportHash,
            diagnostics: [],
          })
          return { status: 'validated', validationToken, reportHash }
        } catch (error) {
          const diagnostics =
            error instanceof ResearchReportValidationError
              ? [...error.diagnostics]
              : [error instanceof Error ? error.message : String(error)]
          exec.agent?.session.append('research/report-prepared', { status: 'invalid', outputPath: paths.markdownPath, diagnostics })
          return { status: 'invalid', diagnostics }
        }
      },
      presentCall: presentPrepareCall,
    }),
  )
  ctx.tools.register(
    defineTool({
      name: 'publish_research_report',
      description: 'Publish one previously validated research report token exactly once.',
      parameters: {
        validationToken: { type: 'string', required: true, description: 'Single-use token returned by prepare_research_report.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            markdownPath: { type: 'string', required: true },
            htmlPath: { type: 'string', required: true },
            reportHash: { type: 'string', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        const publication = prepared.get(args.validationToken)
        if (publication === undefined)
          throw new ResearchReportError('research report validation token is unknown', 'RESEARCH_REPORT_TOKEN_UNKNOWN')
        if (publication.state !== 'validated')
          throw new ResearchReportError(`research report validation token is ${publication.state}`, 'RESEARCH_REPORT_TOKEN_CONSUMED')
        publication.state = 'publishing'
        const markdownTarget = await ctx.fs.resolve(publication.paths.markdownPath, { signal: exec.signal })
        const htmlTarget = await ctx.fs.resolve(publication.paths.htmlPath, { signal: exec.signal })
        if ((await ctx.fs.stat(markdownTarget, exec.signal)) !== undefined) {
          publication.state = 'failed'
          throw new Error(`research report target already exists: ${ctx.fs.processPath(markdownTarget)}`)
        }
        if ((await ctx.fs.stat(htmlTarget, exec.signal)) !== undefined) {
          publication.state = 'failed'
          throw new Error(`research report target already exists: ${ctx.fs.processPath(htmlTarget)}`)
        }
        await ctx.fs.writeText(markdownTarget, publication.markdown, { kind: 'createIfAbsent' }, exec.signal)
        try {
          await ctx.fs.writeText(htmlTarget, publication.html, { kind: 'createIfAbsent' }, exec.signal)
        } catch (error) {
          publication.state = 'failed'
          throw new ResearchReportError(
            `HTML report write failed; Markdown was preserved at ${ctx.fs.processPath(markdownTarget)}`,
            'RESEARCH_REPORT_HTML_WRITE_FAILED',
            { cause: error },
          )
        }
        publication.state = 'published'
        const receipt = {
          markdownPath: ctx.fs.processPath(markdownTarget),
          htmlPath: ctx.fs.processPath(htmlTarget),
          reportHash: publication.reportHash,
        }
        exec.agent?.session.append('research/report-published', receipt)
        exec.agent?.session.append(
          'research/evaluation-completed',
          evaluateResearchPublication(publication.report, publication.ledger, { ...receipt, publishCount: 1 }),
        )
        return receipt
      },
      presentCall: () => ({ card: 'generic', title: 'Publish validated research report' }),
    }),
  )
}
