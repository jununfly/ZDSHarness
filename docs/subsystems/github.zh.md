# GitHub 仓库访问

[English](github.md) | 中文

GitHub 仓库访问 seam 为调研及其他仓库感知型 Consumer 提供结构化 github.com 事实。[`dsh-github`](../../packages/github/github) 负责 `ctx.github` 与提供方选择，[`dsh-github-rest`](../../packages/github/github-rest) 提供 REST 适配器，[`dsh-tool-github`](../../packages/github/tool-github) 负责面向模型的 schema、提示指引、规范 JSON 和展示。主题匹配评分保留在该 seam 之外，因为它取决于各项调研任务，而非 GitHub 事实。

源码：[`packages/github/github/src/types.ts`](../../packages/github/github/src/types.ts)

## 仓库标识与事实

仓库操作使用显式的 owner/name 对。结果保留原始计数和可选的提供方事实，不会填充缺失值。

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

## 搜索与详情读取

搜索结果按 GitHub star 数排序，并由 `GitHubRuntime` 再次限制数量；`truncated` 记录提供方或运行时截断。每项结果都携带用于引用和新鲜度说明的观察时间。

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

缺少默认 README 是观测到的仓库状态，而非仓库不存在错误。文本结果可以包含提供方返回的可引用 README URL。

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

## Commit-pinned source read

Canonical 仓库调研先把默认分支解析到不可变 commit，再以该 SHA 读取完整目录树和所有文件。文件 batch 声明完整结果的字节上限；提供方拒绝超限 batch，不返回部分证据。

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

## 提供方生命周期与失败

提供方使用稳定 id，执行廉价的本地 `available()` 检查，并接收调用方取消信号。注册随 effect 生命周期释放。执行要求恰好一个可用提供方；零个和多个提供方分别抛出 `GITHUB_PROVIDER_UNAVAILABLE` 与 `GITHUB_PROVIDER_AMBIGUOUS`，重复注册抛出 `GITHUB_DUPLICATE_PROVIDER`。

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

github.com REST 适配器在每次操作前解析可选凭据。它以稳定代码表示认证、带重置时间的限流、取消、超时、仓库不存在和上游 5xx 失败；诊断绝不包含凭据值。完整传输错误列表见[提供方包参考](../../packages/github/github-rest/README.md#failures)。

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
