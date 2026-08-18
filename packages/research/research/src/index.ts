/** Versioned research contracts and a deterministic GitHub evidence compiler. @module @deepseek-ai/dsh-research */
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { GitHubRepositoryRef, GitHubRepositoryFile, GitHubRepository } from '@deepseek-ai/dsh-github'
import type {
  ResearchBrief,
  Evidence,
  NavigationDiagnostic,
  RepositoryRevision,
  ResearchEvidenceCache,
  ResearchNavigator,
  ResearchRepositoryCandidate,
  ResolvedResearchSpec,
  VerifiedEvidenceLedger,
} from './types.ts'
import { EvidenceId } from './brand.ts'
import { researchCacheKey } from './cache.ts'
import { HeuristicResearchNavigator } from './navigation.ts'

export type * from './types.ts'
export type { ResearchBrief, Evidence, RepositoryRevision, ResolvedResearchSpec, VerifiedEvidenceLedger }
export { ClaimId, ComparisonId, CriterionId, EvidenceId, RecommendationId } from './brand.ts'
export { HeuristicResearchNavigator } from './navigation.ts'
export { DeepWikiResearchNavigator } from './deepwiki-navigation.ts'
export type { DeepWikiClient } from './deepwiki-navigation.ts'
export { DeepWikiMcpClient, DeepWikiMcpToolClient } from './deepwiki-mcp.ts'
export type { DeepWikiMcpOptions, DeepWikiToolClient } from './deepwiki-mcp.ts'
export { FileResearchEvidenceCache, researchCacheKey } from './cache.ts'
export { compileResearchMarkdown, ResearchReportValidationError, validateResearchReportIr } from './report.ts'
export {
  evaluateResearchPublication,
  researchEfficiencyBaseline,
  researchHealthMetrics,
  researchHealthProjectionDefinition,
} from './health.ts'
export type {
  ResearchCorrectness,
  ResearchEfficiencyAxis,
  ResearchEfficiencyBaseline,
  ResearchEvaluation,
  ResearchHealthMetric,
  ResearchHealthProjection,
  ResearchModelUsage,
  ResearchPublicationFacts,
} from './health.ts'

/**
 * Compute a stable fingerprint for one normalized research brief.
 * @param brief - versioned brief to normalize.
 * @returns lowercase SHA-256 fingerprint.
 */
export function researchBriefFingerprint(brief: ResearchBrief): string {
  const normalized = {
    schema: brief.schema,
    topic: brief.topic,
    criteria: brief.criteria.map(criterion => ({
      id: criterion.id,
      question: criterion.question,
      critical: criterion.critical,
      keywords: [...criterion.keywords],
    })),
    repositories: brief.repositories.map(repository => ({ owner: repository.owner, name: repository.name })),
    ...(brief.discovery === undefined
      ? {}
      : { discovery: { query: brief.discovery.query, limit: brief.discovery.limit, topicKeywords: [...brief.discovery.topicKeywords] } }),
    policyVersion: brief.policyVersion,
    ...(brief.budget === undefined
      ? {}
      : {
        budget: {
          ...(brief.budget.maxFiles === undefined ? {} : { maxFiles: brief.budget.maxFiles }),
          ...(brief.budget.maxBytes === undefined ? {} : { maxBytes: brief.budget.maxBytes }),
          ...(brief.budget.deadlineMs === undefined ? {} : { deadlineMs: brief.budget.deadlineMs }),
        },
      }),
  }
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
}

/**
 * Compute the cache identity for a brief resolved to immutable repository revisions.
 * @param brief - normalized research request.
 * @param revisions - selected repositories and their immutable commit revisions.
 * @returns cache identity for one complete evidence collection.
 */
export function researchLedgerCacheKey(
  brief: ResearchBrief,
  revisions: readonly { readonly repository: GitHubRepositoryRef; readonly sha: string }[],
): string {
  return researchCacheKey(
    researchBriefFingerprint(brief),
    brief.policyVersion,
    revisions.map(item => ({ owner: item.repository.owner, name: item.repository.name, sha: item.sha })),
  )
}

/** Process-local sealed-ledger cache suitable for repeated calls in one runtime. */
export class MemoryResearchEvidenceCache implements ResearchEvidenceCache {
  private readonly entries = new Map<string, VerifiedEvidenceLedger>()

  /** @returns the ledger stored for the exact key, if present. */
  get(key: string): Promise<VerifiedEvidenceLedger | undefined> {
    return Promise.resolve(this.entries.get(key))
  }

  /** Store one immutable ledger by exact cache key. */
  set(key: string, ledger: VerifiedEvidenceLedger): Promise<void> {
    this.entries.set(key, ledger)
    return Promise.resolve()
  }
}

/** Deterministic compiler that pins repositories before reading any evidence. */
export class EvidenceCompiler {
  private readonly navigators: readonly ResearchNavigator[]

  constructor(
    private readonly github: {
      searchRepositories(
        request: { query: string; limit: number },
        signal?: AbortSignal,
      ): Promise<{ repositories: readonly GitHubRepository[] }>
      readRepository(ref: GitHubRepositoryRef, signal?: AbortSignal): Promise<{ repository: GitHubRepository }>
      resolveRevision(ref: GitHubRepositoryRef, signal?: AbortSignal): Promise<RepositoryRevision['revision']>
      listTree(ref: GitHubRepositoryRef, revision: string, signal?: AbortSignal): Promise<RepositoryRevision['tree']>
      readFiles(
        request: { ref: GitHubRepositoryRef; revision: string; paths: readonly string[]; maxBytes: number },
        signal?: AbortSignal,
      ): Promise<readonly GitHubRepositoryFile[]>
    },
    navigators: readonly ResearchNavigator[] = [new HeuristicResearchNavigator()],
    private readonly cache: ResearchEvidenceCache = new MemoryResearchEvidenceCache(),
  ) {
    this.navigators = navigators
  }

  /**
   * Validate a typed brief and materialize compiler defaults before any source read.
   * @param brief - typed versioned research request.
   * @returns immutable compiler specification.
   */
  resolve(brief: ResearchBrief): ResolvedResearchSpec {
    const schema: unknown = brief.schema
    if (schema !== 'zj-research-brief/v1') throw new Error('unsupported research brief schema')
    if (brief.topic.trim().length === 0) throw new Error('research brief topic must not be empty')
    if (brief.criteria.length === 0) throw new Error('research brief must contain at least one criterion')
    if (brief.repositories.length === 0 && brief.discovery === undefined)
      throw new Error('research brief must contain a repository or discovery request')
    if (brief.discovery !== undefined) {
      if (brief.discovery.query.trim().length === 0) throw new Error('research discovery query must not be empty')
      if (!Number.isSafeInteger(brief.discovery.limit) || brief.discovery.limit <= 0)
        throw new Error('research discovery limit must be a positive safe integer')
      if (brief.discovery.topicKeywords.length === 0) throw new Error('research discovery must contain at least one topic keyword')
    }
    const ids = new Set<string>()
    for (const criterion of brief.criteria) {
      if (criterion.id.length === 0 || ids.has(criterion.id))
        throw new Error(`research criterion id must be unique and non-empty: ${criterion.id}`)
      if (criterion.keywords.length === 0) throw new Error(`research criterion ${criterion.id} must contain at least one keyword`)
      ids.add(criterion.id)
    }
    const maxFiles = brief.budget?.maxFiles ?? 24
    const maxBytes = brief.budget?.maxBytes ?? 1_000_000
    const deadlineMs = brief.budget?.deadlineMs ?? 120_000
    if (!Number.isSafeInteger(maxFiles) || maxFiles <= 0) throw new Error('research maxFiles must be a positive safe integer')
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('research maxBytes must be a positive safe integer')
    if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0) throw new Error('research deadlineMs must be a positive safe integer')
    return Object.freeze({ brief, budget: Object.freeze({ maxFiles, maxBytes, deadlineMs }) })
  }

  /**
   * Resolve immutable revisions, select bounded canonical files, and emit a sealed ledger.
   * Missing keyword matches remain unknown instead of becoming negative claims.
   * @param spec - validated compiler specification.
   * @param signal - optional cancellation signal forwarded to source reads.
   * @returns immutable evidence ledger with explicit uncovered criteria.
   */
  async collect(spec: ResolvedResearchSpec, signal?: AbortSignal): Promise<VerifiedEvidenceLedger> {
    const startedAt = performance.now()
    const deadlineAt = startedAt + spec.budget.deadlineMs
    const deadlineSignal = AbortSignal.timeout(spec.budget.deadlineMs)
    const collectionSignal = signal === undefined ? deadlineSignal : AbortSignal.any([signal, deadlineSignal])
    const { brief } = spec
    const candidates = await this.selectCandidates(brief, signal)
    const pinned = await Promise.all(
      candidates.map(async candidate => ({ candidate, revision: await this.github.resolveRevision(candidate.repository, signal) })),
    )
    const cacheKey = researchLedgerCacheKey(
      brief,
      pinned.map(item => ({ repository: item.candidate.repository, sha: item.revision.sha })),
    )
    const cached = await this.cache.get(cacheKey)
    if (cached !== undefined)
      return Object.freeze({
        ...cached,
        observedAt: new Date().toISOString(),
        collection: Object.freeze({ filesRead: 0, sourceBytesRead: 0, durationMs: elapsedMilliseconds(startedAt), cacheHit: true }),
      })
    const repositories: RepositoryRevision[] = []
    const evidence: Evidence[] = []
    const navigation: NavigationDiagnostic[] = []
    const { maxFiles, maxBytes } = spec.budget
    let filesRead = 0
    let remainingBytes = maxBytes
    for (const [repositoryIndex, pinnedRepository] of pinned.entries()) {
      const ref = pinnedRepository.candidate.repository
      const revision = pinnedRepository.revision
      if (deadlineExpired(deadlineAt, deadlineSignal)) {
        repositories.push({ repository: ref, revision, tree: [] })
        navigation.push(deadlineDiagnostic(ref))
        continue
      }
      let tree: RepositoryRevision['tree']
      try {
        tree = await this.github.listTree(ref, revision.sha, collectionSignal)
      } catch (error) {
        if (signal?.aborted === true || !deadlineExpired(deadlineAt, deadlineSignal)) throw error
        repositories.push({ repository: ref, revision, tree: [] })
        navigation.push(deadlineDiagnostic(ref))
        continue
      }
      const item = { repository: ref, revision, tree }
      repositories.push(item)
      const readPaths: string[] = []
      const remainingRepositories = pinned.length - repositoryIndex
      const repositoryFileLimit = Math.ceil((maxFiles - filesRead) / remainingRepositories)
      let repositoryFilesRead = 0
      let repositoryBytesRemaining = Math.ceil(remainingBytes / remainingRepositories)
      let unresolved = brief.criteria.filter(
        criterion => !evidence.some(entry => entry.criterionId === criterion.id && sameRepository(entry.repository, ref)),
      )
      while (
        unresolved.length > 0 &&
        repositoryFilesRead < repositoryFileLimit &&
        repositoryBytesRemaining > 0 &&
        !deadlineExpired(deadlineAt, deadlineSignal)
      ) {
        const candidates: string[] = []
        for (const navigator of this.navigators) {
          if (!navigator.available(ref)) {
            navigation.push({ adapter: navigator.id, repository: ref, status: 'unavailable' })
            continue
          }
          try {
            const hints = await navigator.locate(
              { brief, repository: item, unresolvedCriteria: unresolved, excludedPaths: readPaths },
              collectionSignal,
            )
            navigation.push({ adapter: navigator.id, repository: ref, status: 'used' })
            for (const hint of hints) {
              if (
                !readPaths.includes(hint.path) &&
                tree.some(entry => entry.type === 'blob' && entry.path === hint.path) &&
                !candidates.includes(hint.path)
              )
                candidates.push(hint.path)
            }
          } catch (error) {
            navigation.push({
              adapter: navigator.id,
              repository: ref,
              status: 'failed',
              message: error instanceof Error ? error.message : String(error),
            })
          }
          if (deadlineExpired(deadlineAt, deadlineSignal)) break
        }
        const paths = candidates.slice(0, repositoryFileLimit - repositoryFilesRead)
        if (paths.length === 0) break
        let files: readonly GitHubRepositoryFile[]
        try {
          files = await this.github.readFiles({ ref, revision: revision.sha, paths, maxBytes: repositoryBytesRemaining }, collectionSignal)
        } catch (error) {
          if (signal?.aborted === true || !deadlineExpired(deadlineAt, deadlineSignal)) throw error
          pushDeadlineDiagnostic(navigation, ref)
          break
        }
        readPaths.push(...paths)
        filesRead += files.length
        repositoryFilesRead += files.length
        const sourceBytes = files.reduce((total, file) => total + Buffer.byteLength(file.content), 0)
        repositoryBytesRemaining -= sourceBytes
        remainingBytes -= sourceBytes
        const coveredCriteria = new Set(
          evidence
            .filter(entry => sameRepository(entry.repository, ref))
            .map(entry => entry.criterionId),
        )
        for (const file of files) {
          for (const criterion of unresolved) {
            if (coveredCriteria.has(criterion.id)) continue
            const excerpt = excerptForCriterion(file, criterion.keywords)
            if (excerpt === undefined) continue
            evidence.push({
              id: evidenceId(ref, revision.sha, file.path, criterion.id),
              criterionId: criterion.id,
              repository: ref,
              revision: revision.sha,
              path: file.path,
              sourceUrl: file.htmlUrl ?? `https://github.com/${ref.owner}/${ref.name}/blob/${revision.sha}/${file.path}`,
              excerpt,
              kind: 'canonical',
            })
            coveredCriteria.add(criterion.id)
          }
        }
        unresolved = unresolved.filter(
          criterion => !evidence.some(entry => entry.criterionId === criterion.id && sameRepository(entry.repository, ref)),
        )
      }
      if (unresolved.length > 0 && deadlineExpired(deadlineAt, deadlineSignal)) pushDeadlineDiagnostic(navigation, ref)
    }
    const unknownCriteria = repositories.flatMap(item =>
      brief.criteria
        .filter(
          criterion => !evidence.some(entry => entry.criterionId === criterion.id && sameRepository(entry.repository, item.repository)),
        )
        .map(criterion => ({ criterionId: criterion.id, repository: item.repository })),
    )
    const ledger = Object.freeze({
      schema: 'zj-verified-evidence-ledger/v1',
      compilerVersion: 'research/v1',
      briefFingerprint: researchBriefFingerprint(brief),
      policyVersion: brief.policyVersion,
      observedAt: new Date().toISOString(),
      repositories: Object.freeze(repositories),
      candidates: Object.freeze(candidates),
      evidence: Object.freeze(evidence),
      unknownCriteria: Object.freeze(unknownCriteria),
      navigation: Object.freeze(navigation),
      collection: Object.freeze({
        filesRead,
        sourceBytesRead: maxBytes - remainingBytes,
        durationMs: elapsedMilliseconds(startedAt),
        cacheHit: false,
      }),
    })
    await this.cache.set(cacheKey, ledger)
    return ledger
  }

  private async selectCandidates(brief: ResearchBrief, signal?: AbortSignal): Promise<readonly ResearchRepositoryCandidate[]> {
    const explicit = await Promise.all(
      brief.repositories.map(async (repository) => {
        const result = await this.github.readRepository(repository, signal)
        return candidateFromRepository(
          result.repository,
          brief.discovery?.topicKeywords ?? brief.criteria.flatMap(criterion => criterion.keywords),
          'explicit',
        )
      }),
    )
    const discovery = brief.discovery
    if (discovery === undefined) return explicit
    const result = await this.github.searchRepositories({ query: discovery.query, limit: discovery.limit }, signal)
    const explicitKeys = new Set(explicit.map(candidate => repositoryKey(candidate.repository)))
    const discovered = result.repositories
      .filter(repository => !explicitKeys.has(repositoryKey(repository.ref)))
      .map(repository => candidateFromRepository(repository, discovery.topicKeywords, 'discovered'))
      .sort(
        (left, right) =>
          right.topicMatch - left.topicMatch ||
          right.stars - left.stars ||
          repositoryKey(left.repository).localeCompare(repositoryKey(right.repository)),
      )
      .slice(0, discovery.limit)
    return [...explicit, ...discovered]
  }
}

/**
 * Build a compiler from the GitHub service registered on one context.
 * @param ctx - context carrying `ctx.github`.
 * @returns compiler bound to that service.
 */
export function compilerFromContext(ctx: Context): EvidenceCompiler {
  return new EvidenceCompiler(ctx.github)
}

function excerptForCriterion(file: GitHubRepositoryFile, keywords: readonly string[]): string | undefined {
  const lines = file.content.split(/\r?\n/)
  const index = lines.findIndex(line => keywords.some(keyword => line.toLowerCase().includes(keyword.toLowerCase())))
  if (index < 0) return undefined
  return lines
    .slice(Math.max(0, index - 1), index + 5)
    .join('\n')
    .slice(0, 2_000)
}

function sameRepository(left: GitHubRepositoryRef, right: GitHubRepositoryRef): boolean {
  return left.owner === right.owner && left.name === right.name
}

function evidenceId(ref: GitHubRepositoryRef, revision: string, path: string, criterion: string): Evidence['id'] {
  return EvidenceId(createHash('sha256').update(`${ref.owner}/${ref.name}@${revision}:${path}:${criterion}`).digest('hex').slice(0, 24))
}

function candidateFromRepository(
  repository: GitHubRepository,
  keywords: readonly string[],
  origin: ResearchRepositoryCandidate['origin'],
): ResearchRepositoryCandidate {
  const haystack = [repository.fullName, repository.description ?? '', repository.primaryLanguage ?? '', ...repository.topics]
    .join(' ')
    .toLowerCase()
  const normalized = [...new Set(keywords.map(keyword => keyword.trim().toLowerCase()).filter(Boolean))]
  const matches = normalized.filter(keyword => haystack.includes(keyword)).length
  return {
    repository: repository.ref,
    stars: repository.stars,
    topicMatch: normalized.length === 0 ? 0 : Math.round((matches / normalized.length) * 100),
    origin,
  }
}

function repositoryKey(repository: GitHubRepositoryRef): string {
  return `${repository.owner}/${repository.name}`.toLowerCase()
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt))
}

function deadlineDiagnostic(repository: GitHubRepositoryRef): NavigationDiagnostic {
  return { adapter: 'compiler', repository, status: 'failed', message: 'research collection deadline exceeded' }
}

function pushDeadlineDiagnostic(diagnostics: NavigationDiagnostic[], repository: GitHubRepositoryRef): void {
  if (!diagnostics.some(item => item.adapter === 'compiler' && sameRepository(item.repository, repository)))
    diagnostics.push(deadlineDiagnostic(repository))
}

function deadlineExpired(deadlineAt: number, deadlineSignal: AbortSignal): boolean {
  return deadlineSignal.aborted || performance.now() >= deadlineAt
}
