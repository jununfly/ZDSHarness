import type {
  GitHubRepositoryRef,
  GitHubRepositoryRevision,
  GitHubRepositoryTreeEntry,
  GitHubRepositoryFile,
} from '@deepseek-ai/dsh-github'
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable criterion identity within a research brief. */
export type CriterionId = Branded<'CriterionId'>
/** Stable evidence identity within a sealed ledger. */
export type EvidenceId = Branded<'EvidenceId'>
/** Stable claim identity within a report. */
export type ClaimId = Branded<'ClaimId'>
/** Stable comparison identity within a report. */
export type ComparisonId = Branded<'ComparisonId'>
/** Stable recommendation identity within a report. */
export type RecommendationId = Branded<'RecommendationId'>

/** One normalized research question and the criteria used to answer it. */
export interface ResearchBrief {
  readonly schema: 'zj-research-brief/v1'
  readonly topic: string
  readonly criteria: readonly ResearchCriterion[]
  readonly repositories: readonly GitHubRepositoryRef[]
  readonly discovery?: ResearchDiscoveryRequest
  readonly policyVersion: string
  readonly budget?: { readonly maxFiles?: number; readonly maxBytes?: number; readonly deadlineMs?: number }
}

/** Deterministic GitHub candidate discovery performed before revision pinning. */
export interface ResearchDiscoveryRequest {
  readonly query: string
  readonly limit: number
  readonly topicKeywords: readonly string[]
}

/** Popularity and task-match facts retained separately for one selected candidate. */
export interface ResearchRepositoryCandidate {
  readonly repository: GitHubRepositoryRef
  readonly stars: number
  readonly topicMatch: number
  readonly origin: 'explicit' | 'discovered'
}

/** A criterion that must be supported or remain explicitly unknown. */
export interface ResearchCriterion {
  readonly id: CriterionId
  readonly question: string
  readonly critical: boolean
  readonly keywords: readonly string[]
}

/** Canonical source identity for one repository observation. */
export interface RepositoryRevision {
  readonly repository: GitHubRepositoryRef
  readonly revision: GitHubRepositoryRevision
  readonly tree: readonly GitHubRepositoryTreeEntry[]
}

/** Evidence captured from a commit-pinned canonical file read. */
export interface Evidence {
  readonly id: EvidenceId
  readonly criterionId: CriterionId
  readonly repository: GitHubRepositoryRef
  readonly revision: string
  readonly path: string
  readonly sourceUrl: string
  readonly excerpt: string
  readonly kind: 'canonical'
}

/** Immutable ledger emitted by the compiler; every critical criterion is covered or unknown. */
export interface VerifiedEvidenceLedger {
  readonly schema: 'zj-verified-evidence-ledger/v1'
  readonly compilerVersion: 'research/v1'
  readonly briefFingerprint: string
  readonly policyVersion: string
  readonly observedAt: string
  readonly repositories: readonly RepositoryRevision[]
  readonly candidates: readonly ResearchRepositoryCandidate[]
  readonly evidence: readonly Evidence[]
  readonly unknownCriteria: readonly UnknownCriterion[]
  readonly navigation: readonly NavigationDiagnostic[]
  readonly collection: ResearchCollectionFacts
}

/** Bounded model-facing projection of one sealed evidence ledger. */
export interface ResearchEvidenceDigest {
  readonly schema: 'zj-research-evidence-digest/v1'
  readonly compilerVersion: 'research/v1'
  readonly ledgerFingerprint: string
  readonly policyVersion: string
  readonly observedAt: string
  readonly repositories: readonly {
    readonly repository: GitHubRepositoryRef
    readonly revision: GitHubRepositoryRevision
  }[]
  readonly candidates: readonly ResearchRepositoryCandidate[]
  readonly evidence: readonly Evidence[]
  readonly unknownCriteria: readonly UnknownCriterion[]
  readonly navigation: readonly NavigationDiagnostic[]
  readonly collection: ResearchCollectionFacts
}

/** Operation facts measured by compiler code rather than model self-report. */
export interface ResearchCollectionFacts {
  readonly filesRead: number
  readonly sourceBytesRead: number
  readonly durationMs: number
  readonly cacheHit: boolean
}

/** Cache port for sealed ledgers keyed by revisions, normalized brief, and policy. */
export interface ResearchEvidenceCache {
  /** @returns a previously sealed ledger, or undefined on a cache miss. */
  get(key: string): Promise<VerifiedEvidenceLedger | undefined>
  /** Store one sealed ledger for reuse by later runs. */
  set(key: string, ledger: VerifiedEvidenceLedger): Promise<void>
}

/** One criterion that remains uncovered for one repository. */
export interface UnknownCriterion {
  readonly criterionId: CriterionId
  readonly repository: GitHubRepositoryRef
}

/** One derived navigation candidate; it cannot support a report claim by itself. */
export interface NavigationHint {
  readonly path: string
  readonly criterionIds: readonly CriterionId[]
}

/** Inputs supplied to an internal repository navigation adapter. */
export interface NavigationRequest {
  readonly brief: ResearchBrief
  readonly repository: RepositoryRevision
  readonly unresolvedCriteria: readonly ResearchCriterion[]
  readonly excludedPaths: readonly string[]
}

/** Internal path-finding adapter used before canonical GitHub reads. */
export interface ResearchNavigator {
  readonly id: string
  /** @returns whether this adapter may navigate the repository under current policy. */
  available(repository: GitHubRepositoryRef): boolean
  /** @returns derived candidate paths; callers verify each path against the commit tree. */
  locate(request: NavigationRequest, signal?: AbortSignal): Promise<readonly NavigationHint[]>
}

/** Observable adapter outcome retained without promoting derived hints to evidence. */
export interface NavigationDiagnostic {
  readonly adapter: string
  readonly repository: GitHubRepositoryRef
  readonly status: 'used' | 'unavailable' | 'failed'
  readonly message?: string
}

/** Semantic report input shared by technical-C4 and skill-native projections. */
export interface ResearchReportIr {
  readonly schema: 'zj-research-report-ir/v1'
  readonly family: 'technical-c4/v1' | 'zj-draft/v1'
  readonly title: string
  readonly summary: string
  readonly ledgerFingerprint: string
  readonly concepts: readonly { readonly key: string; readonly value: string }[]
  readonly diagrams: readonly ResearchDiagram[]
  readonly candidates: readonly ResearchCandidate[]
  readonly cards: readonly ResearchCard[]
  readonly claims: readonly ResearchClaim[]
  readonly comparisons: readonly ResearchComparison[]
  readonly recommendations: readonly ResearchRecommendation[]
  readonly metrics: readonly ResearchMetric[]
}

/** C4 or subtopic diagram projected into a Mermaid fence. */
export interface ResearchDiagram {
  readonly title: string
  readonly kind: 'landscape' | 'container' | 'topic'
  readonly mermaid: string
}

/** One repository candidate and its task-specific match score. */
export interface ResearchCandidate {
  readonly repository: GitHubRepositoryRef
  readonly stars: number
  readonly topicMatch: number
  readonly evidenceIds: readonly EvidenceId[]
}

/** One deep-read content card derived from explicit claims. */
export interface ResearchCard {
  readonly title: string
  readonly summary: string
  readonly claimIds: readonly ClaimId[]
}

/** Evidence-backed proposition used by comparisons and recommendations. */
export interface ResearchClaim {
  readonly id: ClaimId
  readonly text: string
  readonly critical: boolean
  readonly evidenceIds: readonly EvidenceId[]
}

/** Cross-project judgment derived from one or more claims. */
export interface ResearchComparison {
  readonly id: ComparisonId
  readonly text: string
  readonly claimIds: readonly ClaimId[]
}

/** Decision statement derived from explicit comparisons. */
export interface ResearchRecommendation {
  readonly id: RecommendationId
  readonly text: string
  readonly comparisonIds: readonly ComparisonId[]
}

/** One measurable technical indicator with an explicit evaluation definition. */
export interface ResearchMetric {
  readonly key: string
  readonly definition: string
  readonly unit: string
  readonly method: string
  readonly condition: string
  readonly expected: string
}

/** Validated compiler input with all deployment defaults materialized. */
export interface ResolvedResearchSpec {
  readonly brief: ResearchBrief
  readonly budget: { readonly maxFiles: number; readonly maxBytes: number; readonly deadlineMs: number }
}

export type { GitHubRepositoryFile }
