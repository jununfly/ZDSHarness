/**
 * GitHub REST adapter for the structured repository capability.
 * @module @deepseek-ai/dsh-github-rest/provider
 */

import { Octokit } from '@octokit/rest'
import type {
  GitHubProvider,
  GitHubRepository,
  GitHubRepositoryReadResult,
  GitHubRepositoryRef,
  GitHubRepositorySearchRequest,
  GitHubRepositorySearchResult,
  GitHubRepositoryFile,
  GitHubRepositoryFilesRequest,
  GitHubRepositoryRevision,
  GitHubRepositoryTreeEntry,
} from '@deepseek-ai/dsh-github'
import { GitHubError } from '@deepseek-ai/dsh-github'

/** Stable provider id registered in `ctx.github`. */
export const GITHUB_REST_PROVIDER_ID = 'github-rest'

/** Operation-scoped settings used by {@link GitHubRestProvider}. */
export interface GitHubRestProviderOptions {
  /** Resolve the optional GitHub token for each operation. */
  readonly resolveToken: () => Promise<string | undefined>
  /** Per-request timeout in milliseconds. */
  readonly timeoutMs: number
}

/** GitHub.com REST provider for repository search and README retrieval. */
export class GitHubRestProvider implements GitHubProvider {
  readonly id = GITHUB_REST_PROVIDER_ID

  constructor(private readonly options: GitHubRestProviderOptions) {}

  /** @returns true because anonymous github.com requests are supported. */
  available(): boolean {
    return true
  }

  /**
   * Search github.com repositories by descending star count.
   * @param request - query and result limit.
   * @param signal - optional cancellation signal.
   * @returns mapped repository facts and observation time.
   */
  async searchRepositories(request: GitHubRepositorySearchRequest, signal?: AbortSignal): Promise<GitHubRepositorySearchResult> {
    const octokit = await this.client()
    const repositories: GitHubRepository[] = []
    let totalCount = 0
    let incomplete = false
    let page = 1
    while (repositories.length < request.limit) {
      const perPage = Math.min(100, request.limit - repositories.length)
      const response = await this.request(signal, requestSignal =>
        octokit.rest.search.repos({
          q: request.query,
          sort: 'stars',
          order: 'desc',
          per_page: perPage,
          page,
          request: { signal: requestSignal },
        }),
      )
      totalCount = response.data.total_count
      incomplete ||= response.data.incomplete_results
      repositories.push(...response.data.items.map(mapRepository))
      if (response.data.items.length < perPage) break
      page += 1
    }
    return {
      repositories,
      observedAt: new Date().toISOString(),
      truncated: incomplete || totalCount > repositories.length,
    }
  }

  /**
   * @param _ref - repository owner and name.
   * @param _signal - optional cancellation signal.
   * @returns repository facts and README state.
   */
  async readRepository(ref: GitHubRepositoryRef, signal?: AbortSignal): Promise<GitHubRepositoryReadResult> {
    const octokit = await this.client()
    const repositoryResponse = await this.request(signal, requestSignal =>
      octokit.rest.repos.get({
        owner: ref.owner,
        repo: ref.name,
        request: { signal: requestSignal },
      }),
    ).catch((error: unknown) => {
      if (isHttpStatus(error, 404)) {
        throw new GitHubError(`GitHub repository ${ref.owner}/${ref.name} was not found`, 'GITHUB_REPOSITORY_NOT_FOUND', { cause: error })
      }
      throw error
    })
    let readmeResponse
    try {
      readmeResponse = await this.request(signal, requestSignal =>
        octokit.rest.repos.getReadme({
          owner: ref.owner,
          repo: ref.name,
          request: { signal: requestSignal },
        }),
      )
    } catch (error) {
      if (isHttpStatus(error, 404)) {
        return {
          repository: mapRepository(repositoryResponse.data),
          readme: { kind: 'missing' },
          observedAt: new Date().toISOString(),
        }
      }
      throw error
    }
    const readme = readmeResponse.data
    if (Array.isArray(readme) || readme.encoding !== 'base64' || typeof readme.content !== 'string') {
      throw new Error(`GitHub README for ${ref.owner}/${ref.name} is not base64 text`)
    }
    return {
      repository: mapRepository(repositoryResponse.data),
      readme: {
        kind: 'text',
        content: Buffer.from(readme.content.replaceAll('\n', ''), 'base64').toString('utf8'),
        ...(readme.html_url === null ? {} : { url: readme.html_url }),
      },
      observedAt: new Date().toISOString(),
    }
  }

  /** Resolve the default branch to the commit SHA used by later reads. */
  async resolveRevision(ref: GitHubRepositoryRef, signal?: AbortSignal): Promise<GitHubRepositoryRevision> {
    const octokit = await this.client()
    const repository = await this.request(signal, requestSignal =>
      octokit.rest.repos.get({
        owner: ref.owner,
        repo: ref.name,
        request: { signal: requestSignal },
      }),
    )
    const commit = await this.request(signal, requestSignal =>
      octokit.rest.repos.getBranch({
        owner: ref.owner,
        repo: ref.name,
        branch: repository.data.default_branch,
        request: { signal: requestSignal },
      }),
    )
    return {
      sha: commit.data.commit.sha,
      branch: repository.data.default_branch,
      url: stringOr(
        commit.data.commit.html_url,
        `https://github.com/${ref.owner}/${ref.name}/commit/${commit.data.commit.sha}`,
      ),
    }
  }

  /** List the complete commit tree; callers apply their own file and byte bounds. */
  async listTree(ref: GitHubRepositoryRef, revision: string, signal?: AbortSignal): Promise<readonly GitHubRepositoryTreeEntry[]> {
    const octokit = await this.client()
    const response = await this.request(signal, requestSignal =>
      octokit.rest.git.getTree({
        owner: ref.owner,
        repo: ref.name,
        tree_sha: revision,
        recursive: 'true',
        request: { signal: requestSignal },
      }),
    )
    if (response.data.truncated)
      throw new GitHubError(`GitHub tree for ${ref.owner}/${ref.name}@${revision} was truncated`, 'GITHUB_TREE_TRUNCATED')
    return response.data.tree.map(entry => ({
      path: requiredString(entry.path, 'a tree entry path'),
      sha: requiredString(entry.sha, 'a tree entry sha'),
      type: repositoryTreeType(entry.type),
      ...(entry.size === undefined ? {} : { size: entry.size }),
    }))
  }

  /** Read selected files through commit-pinned contents endpoints. */
  async readFiles(request: GitHubRepositoryFilesRequest, signal?: AbortSignal): Promise<readonly GitHubRepositoryFile[]> {
    const { ref, revision, paths } = request
    const octokit = await this.client()
    const files: GitHubRepositoryFile[] = []
    let bytes = 0
    for (const path of paths) {
      const response = await this.request(signal, requestSignal =>
        octokit.rest.repos.getContent({
          owner: ref.owner,
          repo: ref.name,
          path,
          ref: revision,
          request: { signal: requestSignal },
        }),
      )
      const data = response.data
      if (
        Array.isArray(data) ||
        data.type !== 'file' ||
        data.encoding !== 'base64' ||
        typeof data.content !== 'string' ||
        typeof data.sha !== 'string'
      ) {
        throw new GitHubError(`GitHub path ${path} at ${revision} is not a base64 file`, 'GITHUB_FILE_NOT_TEXT')
      }
      const content = Buffer.from(data.content.replaceAll('\n', ''), 'base64').toString('utf8')
      bytes += Buffer.byteLength(content)
      if (bytes > request.maxBytes) {
        throw new GitHubError(
          `GitHub file batch for ${ref.owner}/${ref.name}@${revision} exceeds ${request.maxBytes} bytes`,
          'GITHUB_FILES_TOO_LARGE',
        )
      }
      files.push({
        path,
        sha: data.sha,
        content,
        ...optionalString(data.html_url, 'htmlUrl'),
      })
    }
    return files
  }

  private async client(): Promise<Octokit> {
    const token = await this.options.resolveToken()
    return new Octokit({
      ...(token === undefined || token.length === 0 ? {} : { auth: token }),
      request: {
        fetch: globalThis.fetch,
        timeout: this.options.timeoutMs,
      },
    })
  }

  private async request<T>(callerSignal: AbortSignal | undefined, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const timeoutSignal = AbortSignal.timeout(this.options.timeoutMs)
    const signal = callerSignal === undefined ? timeoutSignal : AbortSignal.any([callerSignal, timeoutSignal])
    try {
      return await operation(signal)
    } catch (error) {
      throw translateGitHubError(error, callerSignal, timeoutSignal)
    }
  }
}

/** Identify an Octokit HTTP failure without depending on its concrete error class. */
function isHttpStatus(error: unknown, status: number): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === status
}

/** Translate provider failures whose recovery action is stable across Octokit versions. */
function translateGitHubError(error: unknown, callerSignal?: AbortSignal, timeoutSignal?: AbortSignal): Error {
  if (callerSignal?.aborted === true) {
    return new GitHubError('GitHub request was cancelled', 'GITHUB_REQUEST_CANCELLED', { cause: error })
  }
  if (timeoutSignal?.aborted === true) {
    return new GitHubError('GitHub request timed out', 'GITHUB_REQUEST_TIMEOUT', { cause: error })
  }
  const status = errorProperty(error, 'status')
  const remaining = responseHeader(error, 'x-ratelimit-remaining')
  if ((status === 403 || status === 429) && remaining === '0') {
    const reset = responseHeader(error, 'x-ratelimit-reset')
    const resetAt = reset === undefined ? 'the server reset time' : new Date(Number(reset) * 1_000).toISOString()
    return new GitHubError(`GitHub API rate limit exhausted; retry after ${resetAt}`, 'GITHUB_RATE_LIMITED', { cause: error })
  }
  if (status === 401) {
    return new GitHubError('GitHub rejected the configured credential', 'GITHUB_AUTHENTICATION_FAILED', { cause: error })
  }
  if (typeof status === 'number' && status >= 500) {
    return new GitHubError('GitHub REST API request failed', 'GITHUB_UPSTREAM_FAILED', { cause: error })
  }
  return error instanceof Error ? error : new Error('GitHub REST request failed', { cause: error })
}

function errorProperty(error: unknown, key: string): unknown {
  return typeof error === 'object' && error !== null && key in error ? (error as Record<string, unknown>)[key] : undefined
}

function responseHeader(error: unknown, name: string): string | undefined {
  const response = errorProperty(error, 'response')
  const headers = errorProperty(response, 'headers')
  if (typeof headers !== 'object' || headers === null) return undefined
  const value = (headers as Record<string, unknown>)[name]
  return typeof value === 'string' ? value : undefined
}

function requiredString(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value
  throw new GitHubError(`GitHub REST response is missing ${fallback}`, 'GITHUB_UPSTREAM_FAILED')
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function optionalString(value: unknown, key: 'htmlUrl'): { readonly htmlUrl?: string } {
  return typeof value === 'string' ? { [key]: value } : {}
}

function repositoryTreeType(value: unknown): 'blob' | 'tree' {
  if (value === 'blob' || value === 'tree') return value
  throw new GitHubError(`GitHub tree returned unsupported entry type: ${String(value)}`, 'GITHUB_UPSTREAM_FAILED')
}

interface RepositoryPayload {
  readonly name: string
  readonly full_name: string
  readonly owner?: { readonly login?: string } | null
  readonly html_url: string
  readonly description: string | null
  readonly stargazers_count: number
  readonly forks_count: number
  readonly open_issues_count: number
  readonly archived: boolean
  readonly default_branch: string
  readonly pushed_at: string | null
  readonly topics?: readonly string[]
  readonly license?: { readonly spdx_id?: string | null } | null
  readonly language: string | null
}

/** Map one GitHub Search result without inventing absent optional facts. */
function mapRepository(repository: RepositoryPayload): GitHubRepository {
  return {
    ref: { owner: repository.owner?.login ?? repository.full_name.split('/', 1)[0] ?? repository.full_name, name: repository.name },
    fullName: repository.full_name,
    url: repository.html_url,
    ...(repository.description === null ? {} : { description: repository.description }),
    stars: repository.stargazers_count,
    forks: repository.forks_count,
    openIssues: repository.open_issues_count,
    archived: repository.archived,
    defaultBranch: repository.default_branch,
    ...(repository.pushed_at === null ? {} : { pushedAt: repository.pushed_at }),
    topics: repository.topics ?? [],
    ...(repository.license?.spdx_id === undefined || repository.license.spdx_id === null ? {} : { license: repository.license.spdx_id }),
    ...(repository.language === null ? {} : { primaryLanguage: repository.language }),
  }
}
