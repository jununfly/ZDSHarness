/**
 * Provider-neutral repository facts exposed by the GitHub capability.
 * @module @deepseek-ai/dsh-github/types
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'

/** Typed GitHub capability failure with a stable machine-routable code. */
export class GitHubError extends HarnessError {}

/** Owner and repository name accepted by GitHub repository operations. */
export interface GitHubRepositoryRef {
  readonly owner: string
  readonly name: string
}

/** Repository facts returned by GitHub search and detail reads. */
export interface GitHubRepository {
  readonly ref: GitHubRepositoryRef
  readonly fullName: string
  readonly url: string
  readonly description?: string
  readonly stars: number
  readonly forks: number
  readonly openIssues: number
  readonly archived: boolean
  readonly defaultBranch: string
  readonly pushedAt?: string
  readonly topics: readonly string[]
  readonly license?: string
  readonly primaryLanguage?: string
}

/** Inputs for one repository search, ordered by GitHub star count. */
export interface GitHubRepositorySearchRequest {
  readonly query: string
  readonly limit: number
}

/** Bounded repository search result with its observation time. */
export interface GitHubRepositorySearchResult {
  readonly repositories: readonly GitHubRepository[]
  readonly observedAt: string
  readonly truncated: boolean
}

/** README availability for a repository detail read. */
export type GitHubReadme = { readonly kind: 'text'; readonly content: string; readonly url?: string } | { readonly kind: 'missing' }

/** Repository facts and README state observed in one provider operation. */
export interface GitHubRepositoryReadResult {
  readonly repository: GitHubRepository
  readonly readme: GitHubReadme
  readonly observedAt: string
}

/** Immutable commit selected for a repository research run. */
export interface GitHubRepositoryRevision {
  readonly sha: string
  readonly branch: string
  readonly url: string
}

/** One entry from a commit-pinned repository tree. */
export interface GitHubRepositoryTreeEntry {
  readonly path: string
  readonly type: 'blob' | 'tree'
  readonly sha: string
  readonly size?: number
}

/** UTF-8 file content read at one immutable revision. */
export interface GitHubRepositoryFile {
  readonly path: string
  readonly content: string
  readonly sha: string
  readonly htmlUrl?: string
}

/** Commit-pinned bounded file batch requested from a GitHub provider. */
export interface GitHubRepositoryFilesRequest {
  readonly ref: GitHubRepositoryRef
  readonly revision: string
  readonly paths: readonly string[]
  readonly maxBytes: number
}

/** Provider adapter registered with {@link GitHubRuntime}. */
export interface GitHubProvider {
  readonly id: string
  /** @returns whether this provider can serve calls without network I/O. */
  available(): boolean
  /**
   * @param request - query and result limit.
   * @param signal - optional cancellation signal.
   * @returns repositories ordered by star count.
   */
  searchRepositories(request: GitHubRepositorySearchRequest, signal?: AbortSignal): Promise<GitHubRepositorySearchResult>
  /**
   * @param ref - repository owner and name.
   * @param signal - optional cancellation signal.
   * @returns repository facts and README availability.
   */
  readRepository(ref: GitHubRepositoryRef, signal?: AbortSignal): Promise<GitHubRepositoryReadResult>
  /** Resolve the default branch to an immutable commit. */
  resolveRevision?(ref: GitHubRepositoryRef, signal?: AbortSignal): Promise<GitHubRepositoryRevision>
  /** List a bounded tree at an immutable commit. */
  listTree?(ref: GitHubRepositoryRef, revision: string, signal?: AbortSignal): Promise<readonly GitHubRepositoryTreeEntry[]>
  /** Read a batch of UTF-8 files at an immutable commit. */
  readFiles?(request: GitHubRepositoryFilesRequest, signal?: AbortSignal): Promise<readonly GitHubRepositoryFile[]>
}
