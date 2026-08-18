/**
 * Service Definition for structured GitHub repository discovery and reading.
 * @module @deepseek-ai/dsh-github
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type {
  GitHubProvider,
  GitHubRepositoryReadResult,
  GitHubRepositoryRef,
  GitHubRepositorySearchRequest,
  GitHubRepositorySearchResult,
  GitHubRepositoryFile,
  GitHubRepositoryFilesRequest,
  GitHubRepositoryRevision,
  GitHubRepositoryTreeEntry,
} from './types.ts'
import { GitHubError } from './types.ts'

export { GitHubError } from './types.ts'
export type {
  GitHubProvider,
  GitHubReadme,
  GitHubRepository,
  GitHubRepositoryReadResult,
  GitHubRepositoryRef,
  GitHubRepositorySearchRequest,
  GitHubRepositorySearchResult,
  GitHubRepositoryFile,
  GitHubRepositoryFilesRequest,
  GitHubRepositoryRevision,
  GitHubRepositoryTreeEntry,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    github: GitHubRuntime
  }
}

/** Structured GitHub capability registered as `ctx.github`. */
export class GitHubRuntime extends Service {
  private readonly providers = new Map<string, GitHubProvider>()

  constructor(ctx: Context) {
    super(ctx, 'github')
  }

  /**
   * Register one provider for the contributing fiber's lifetime.
   * @param provider - provider keyed by its stable id.
   * @returns a disposer that removes the provider.
   */
  registerProvider(provider: GitHubProvider): () => void {
    if (this.providers.has(provider.id)) {
      throw new GitHubError(`GitHub provider ${JSON.stringify(provider.id)} is already registered`, 'GITHUB_DUPLICATE_PROVIDER')
    }
    const providers = this.providers
    const dispose = this.ctx.effect(function* () {
      providers.set(provider.id, provider)
      yield () => providers.delete(provider.id)
    }, 'github.registerProvider()')
    return () => void dispose()
  }

  /**
   * Search through the sole available provider and enforce the requested result limit.
   * @param request - query and positive result limit.
   * @param signal - optional cancellation signal.
   * @returns repositories capped to `request.limit`.
   */
  async searchRepositories(request: GitHubRepositorySearchRequest, signal?: AbortSignal): Promise<GitHubRepositorySearchResult> {
    const result = await this.provider().searchRepositories(request, signal)
    if (result.repositories.length <= request.limit) return result
    return {
      ...result,
      repositories: result.repositories.slice(0, request.limit),
      truncated: true,
    }
  }

  /**
   * Read one repository through the sole available provider.
   * @param ref - repository owner and name.
   * @param signal - optional cancellation signal.
   * @returns repository facts and README availability.
   */
  readRepository(ref: GitHubRepositoryRef, signal?: AbortSignal): Promise<GitHubRepositoryReadResult> {
    return this.provider().readRepository(ref, signal)
  }

  /**
   * Resolve a repository's default branch to an immutable commit.
   * @param ref - repository owner and name.
   * @param signal - optional cancellation signal.
   * @returns immutable commit identity and source URL.
   */
  resolveRevision(ref: GitHubRepositoryRef, signal?: AbortSignal): Promise<GitHubRepositoryRevision> {
    const provider = this.provider()
    if (provider.resolveRevision === undefined)
      throw new GitHubError(`GitHub provider ${provider.id} does not support revision resolution`, 'GITHUB_REVISION_UNSUPPORTED')
    return provider.resolveRevision(ref, signal)
  }

  /**
   * List repository files at an immutable commit.
   * @param ref - repository owner and name.
   * @param revision - immutable commit SHA.
   * @param signal - optional cancellation signal.
   * @returns the complete commit tree.
   */
  listTree(ref: GitHubRepositoryRef, revision: string, signal?: AbortSignal): Promise<readonly GitHubRepositoryTreeEntry[]> {
    const provider = this.provider()
    if (provider.listTree === undefined)
      throw new GitHubError(`GitHub provider ${provider.id} does not support tree reads`, 'GITHUB_TREE_UNSUPPORTED')
    return provider.listTree(ref, revision, signal)
  }

  /**
   * Read a bounded batch of repository files at an immutable commit.
   * @param request - repository, revision, paths, and complete-result byte limit.
   * @param signal - optional cancellation signal.
   * @returns UTF-8 files whose combined content fits the requested limit.
   */
  readFiles(request: GitHubRepositoryFilesRequest, signal?: AbortSignal): Promise<readonly GitHubRepositoryFile[]> {
    const provider = this.provider()
    if (provider.readFiles === undefined)
      throw new GitHubError(`GitHub provider ${provider.id} does not support commit-pinned file reads`, 'GITHUB_FILES_UNSUPPORTED')
    return provider.readFiles(request, signal)
  }

  private provider(): GitHubProvider {
    const available = [...this.providers.values()].filter(provider => provider.available())
    if (available.length === 0) {
      throw new GitHubError('No available GitHub provider is registered', 'GITHUB_PROVIDER_UNAVAILABLE')
    }
    if (available.length > 1) {
      throw new GitHubError(
        `Multiple GitHub providers are available: ${available.map(provider => provider.id).join(', ')}`,
        'GITHUB_PROVIDER_AMBIGUOUS',
      )
    }
    const provider = available[0]
    if (provider === undefined) {
      throw new GitHubError('No available GitHub provider is registered', 'GITHUB_PROVIDER_UNAVAILABLE')
    }
    return provider
  }
}

export default GitHubRuntime
