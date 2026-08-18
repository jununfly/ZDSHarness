# GitHub Repository Access

English | [中文](github.zh.md)

The GitHub repository access seam provides structured github.com facts for research and other repository-aware Consumers. [`dsh-github`](../../packages/github/github) owns `ctx.github` and provider selection, [`dsh-github-rest`](../../packages/github/github-rest) supplies the REST adapter, and [`dsh-tool-github`](../../packages/github/tool-github) owns model-facing schemas, prompt guidance, canonical JSON, and presentation. Topic-match scoring remains outside the seam because it depends on each research task rather than GitHub facts.

Source: [`packages/github/github/src/types.ts`](../../packages/github/github/src/types.ts)

## Repository identity and facts

Repository operations use an explicit owner/name pair. Results retain raw counts and optional provider facts without filling absent values.

```ts type-equiv
/** Owner and repository name accepted by GitHub repository operations. */
interface GitHubRepositoryRef {
  readonly owner: string
  readonly name: string
}
```

```ts type-equiv
/** Repository facts returned by GitHub search and detail reads. */
interface GitHubRepository {
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
```

## Search and detail reads

Search results are ordered by GitHub star count and capped again by `GitHubRuntime`; `truncated` records provider or runtime truncation. Every result carries the observation time used for citations and freshness statements.

```ts type-equiv
/** Inputs for one repository search, ordered by GitHub star count. */
interface GitHubRepositorySearchRequest {
  readonly query: string
  readonly limit: number
}
```

```ts type-equiv
/** Bounded repository search result with its observation time. */
interface GitHubRepositorySearchResult {
  readonly repositories: readonly GitHubRepository[]
  readonly observedAt: string
  readonly truncated: boolean
}
```

A missing default README is an observed repository state, not a missing-repository error. Text results may include the provider's citeable README URL.

```ts type-equiv
/** README availability for a repository detail read. */
type GitHubReadme = { readonly kind: 'text'; readonly content: string; readonly url?: string } | { readonly kind: 'missing' }
```

```ts type-equiv
/** Repository facts and README state observed in one provider operation. */
interface GitHubRepositoryReadResult {
  readonly repository: GitHubRepository
  readonly readme: GitHubReadme
  readonly observedAt: string
}
```

## Commit-pinned source reads

Canonical repository research first resolves the default branch to an immutable commit, then uses that SHA for the complete tree and every file read. A file batch declares its complete-result byte limit; providers reject oversized batches without returning partial evidence.

```ts type-equiv
/** Immutable commit selected for a repository research run. */
interface GitHubRepositoryRevision {
  readonly sha: string
  readonly branch: string
  readonly url: string
}
```

```ts type-equiv
/** One entry from a commit-pinned repository tree. */
interface GitHubRepositoryTreeEntry {
  readonly path: string
  readonly type: 'blob' | 'tree'
  readonly sha: string
  readonly size?: number
}
```

```ts type-equiv
/** UTF-8 file content read at one immutable revision. */
interface GitHubRepositoryFile {
  readonly path: string
  readonly content: string
  readonly sha: string
  readonly htmlUrl?: string
}
```

```ts type-equiv
/** Commit-pinned bounded file batch requested from a GitHub provider. */
interface GitHubRepositoryFilesRequest {
  readonly ref: GitHubRepositoryRef
  readonly revision: string
  readonly paths: readonly string[]
  readonly maxBytes: number
}
```

## Provider lifecycle and failures

Providers use stable ids, perform a cheap local `available()` check, and receive caller cancellation. Registration is effect-scoped. Execution requires exactly one available provider; zero and multiple providers raise `GITHUB_PROVIDER_UNAVAILABLE` and `GITHUB_PROVIDER_AMBIGUOUS`, while duplicate registration raises `GITHUB_DUPLICATE_PROVIDER`.

```ts type-equiv
/** Provider adapter registered with {@link GitHubRuntime}. */
interface GitHubProvider {
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
```

The github.com REST adapter resolves its optional credential before every operation. It uses stable codes for authentication, rate limits with reset time, cancellation, timeout, missing repositories, and upstream 5xx failures; diagnostics never include the credential value. The complete transport list lives in the [provider package reference](../../packages/github/github-rest/README.md#failures).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxgithub--githubruntime"></a>

### `ctx.github` — `GitHubRuntime`

Structured GitHub capability registered as `ctx.github`.

```ts cordis-catalog
/**
 * Register one provider for the contributing fiber's lifetime.
 * @param provider - provider keyed by its stable id.
 * @returns a disposer that removes the provider.
 */
registerProvider(provider: GitHubProvider): () => void

/**
 * Search through the sole available provider and enforce the requested result limit.
 * @param request - query and positive result limit.
 * @param signal - optional cancellation signal.
 * @returns repositories capped to `request.limit`.
 */
async searchRepositories(request: GitHubRepositorySearchRequest, signal?: AbortSignal): Promise<GitHubRepositorySearchResult>

/**
 * Read one repository through the sole available provider.
 * @param ref - repository owner and name.
 * @param signal - optional cancellation signal.
 * @returns repository facts and README availability.
 */
readRepository(ref: GitHubRepositoryRef, signal?: AbortSignal): Promise<GitHubRepositoryReadResult>

/**
 * Resolve a repository's default branch to an immutable commit.
 * @param ref - repository owner and name.
 * @param signal - optional cancellation signal.
 * @returns immutable commit identity and source URL.
 */
resolveRevision(ref: GitHubRepositoryRef, signal?: AbortSignal): Promise<GitHubRepositoryRevision>

/**
 * List repository files at an immutable commit.
 * @param ref - repository owner and name.
 * @param revision - immutable commit SHA.
 * @param signal - optional cancellation signal.
 * @returns the complete commit tree.
 */
listTree(ref: GitHubRepositoryRef, revision: string, signal?: AbortSignal): Promise<readonly GitHubRepositoryTreeEntry[]>

/**
 * Read a bounded batch of repository files at an immutable commit.
 * @param request - repository, revision, paths, and complete-result byte limit.
 * @param signal - optional cancellation signal.
 * @returns UTF-8 files whose combined content fits the requested limit.
 */
readFiles(request: GitHubRepositoryFilesRequest, signal?: AbortSignal): Promise<readonly GitHubRepositoryFile[]>
```

Source: [`packages/github/github/src/index.ts:42`](../../packages/github/github/src/index.ts)
<!-- END GENERATED cordis-surface -->
