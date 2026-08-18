/** Versioned standalone JSON protocol for Evidence and Report compilers. @module @deepseek-ai/dsh-research-cli */
import { createHash } from 'node:crypto'
import type {
  GitHubRepository,
  GitHubRepositoryFile,
  GitHubRepositoryFilesRequest,
  GitHubRepositoryReadResult,
  GitHubRepositoryRef,
  GitHubRepositoryRevision,
  GitHubRepositorySearchRequest,
  GitHubRepositoryTreeEntry,
} from '@deepseek-ai/dsh-github'
import {
  compileResearchMarkdown,
  EvidenceCompiler,
  evaluateResearchPublication,
  type ResearchBrief,
  type ResearchEvidenceCache,
  type ResearchNavigator,
  type ResearchReportIr,
  type VerifiedEvidenceLedger,
} from '@deepseek-ai/dsh-research'
import { renderResearchHtml } from '@deepseek-ai/dsh-research-report'

/** Stable protocol version accepted and emitted by the standalone CLI. */
export const RESEARCH_CLI_PROTOCOL = 'zj-research-cli/v1' as const

/** Provider operations required by the standalone Evidence Compiler. */
export interface ResearchCliGitHub {
  searchRepositories(
    request: GitHubRepositorySearchRequest,
    signal?: AbortSignal,
  ): Promise<{ readonly repositories: readonly GitHubRepository[] }>
  readRepository(ref: GitHubRepositoryRef, signal?: AbortSignal): Promise<GitHubRepositoryReadResult>
  resolveRevision(ref: GitHubRepositoryRef, signal?: AbortSignal): Promise<GitHubRepositoryRevision>
  listTree(ref: GitHubRepositoryRef, revision: string, signal?: AbortSignal): Promise<readonly GitHubRepositoryTreeEntry[]>
  readFiles(request: GitHubRepositoryFilesRequest, signal?: AbortSignal): Promise<readonly GitHubRepositoryFile[]>
}

/** Versioned operation accepted on stdin. */
export type ResearchCliRequest =
  | { readonly protocol: typeof RESEARCH_CLI_PROTOCOL; readonly operation: 'describe' }
  | { readonly protocol: typeof RESEARCH_CLI_PROTOCOL; readonly operation: 'collect'; readonly brief: ResearchBrief }
  | {
    readonly protocol: typeof RESEARCH_CLI_PROTOCOL
    readonly operation: 'compile-report'
    readonly report: ResearchReportIr
    readonly ledger: VerifiedEvidenceLedger
  }
  | {
    readonly protocol: typeof RESEARCH_CLI_PROTOCOL
    readonly operation: 'render-html'
    readonly family: ResearchReportIr['family']
    readonly markdown: string
  }
  | {
    readonly protocol: typeof RESEARCH_CLI_PROTOCOL
    readonly operation: 'evaluate'
    readonly report: ResearchReportIr
    readonly ledger: VerifiedEvidenceLedger
    readonly publication: {
      readonly reportHash: string
      readonly markdownPath: string
      readonly htmlPath: string
      readonly publishCount: number
    }
  }

/** Versioned successful response emitted on stdout. */
export interface ResearchCliResponse {
  readonly protocol: typeof RESEARCH_CLI_PROTOCOL
  readonly operation: ResearchCliRequest['operation']
  readonly result: unknown
}

/** Internal compiler adapters selected by the standalone host. */
export interface ResearchCliCompilerOptions {
  readonly navigators?: readonly ResearchNavigator[]
  readonly cache?: ResearchEvidenceCache
}

/**
 * Execute one validated protocol request without reading process globals.
 * @param request - versioned operation decoded from stdin JSON.
 * @param github - canonical GitHub source used by collect operations.
 * @param signal - optional cancellation signal.
 * @param options - optional navigation and cache adapters selected by the host.
 * @returns versioned JSON response.
 */
export async function handleResearchCliRequest(
  request: ResearchCliRequest,
  github: ResearchCliGitHub,
  signal?: AbortSignal,
  options: ResearchCliCompilerOptions = {},
): Promise<ResearchCliResponse> {
  const protocol: unknown = request.protocol
  if (protocol !== RESEARCH_CLI_PROTOCOL) throw new Error(`unsupported research CLI protocol: ${String(protocol)}`)
  switch (request.operation) {
    case 'describe':
      return {
        protocol: RESEARCH_CLI_PROTOCOL,
        operation: request.operation,
        result: { operations: ['collect', 'compile-report', 'render-html', 'evaluate'] },
      }
    case 'collect': {
      const compiler = new EvidenceCompiler(github, options.navigators, options.cache)
      return {
        protocol: RESEARCH_CLI_PROTOCOL,
        operation: request.operation,
        result: await compiler.collect(compiler.resolve(request.brief), signal),
      }
    }
    case 'compile-report': {
      const markdown = compileResearchMarkdown(request.report, request.ledger)
      return {
        protocol: RESEARCH_CLI_PROTOCOL,
        operation: request.operation,
        result: { markdown, reportHash: createHash('sha256').update(markdown).digest('hex') },
      }
    }
    case 'render-html':
      return {
        protocol: RESEARCH_CLI_PROTOCOL,
        operation: request.operation,
        result: { html: await renderResearchHtml(request.markdown, request.family) },
      }
    case 'evaluate':
      return {
        protocol: RESEARCH_CLI_PROTOCOL,
        operation: request.operation,
        result: evaluateResearchPublication(request.report, request.ledger, request.publication),
      }
    default:
      return assertNever(request)
  }
}

function assertNever(value: never): never {
  throw new Error(`unsupported research CLI operation: ${JSON.stringify(value)}`)
}
