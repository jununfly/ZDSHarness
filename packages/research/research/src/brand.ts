/** Runtime constructors for research identities. @module @deepseek-ai/dsh-research/brand */
import type {
  ClaimId as ClaimIdType,
  ComparisonId as ComparisonIdType,
  CriterionId as CriterionIdType,
  EvidenceId as EvidenceIdType,
  RecommendationId as RecommendationIdType,
} from './types.ts'

/**
 * Brand one validated criterion id.
 * @param value - validated criterion id.
 * @returns the same string with its criterion brand.
 */
export const CriterionId = (value: string): CriterionIdType => value as CriterionIdType
/**
 * Brand one validated evidence id.
 * @param value - validated evidence id.
 * @returns the same string with its evidence brand.
 */
export const EvidenceId = (value: string): EvidenceIdType => value as EvidenceIdType
/**
 * Brand one validated claim id.
 * @param value - validated claim id.
 * @returns the same string with its claim brand.
 */
export const ClaimId = (value: string): ClaimIdType => value as ClaimIdType
/**
 * Brand one validated comparison id.
 * @param value - validated comparison id.
 * @returns the same string with its comparison brand.
 */
export const ComparisonId = (value: string): ComparisonIdType => value as ComparisonIdType
/**
 * Brand one validated recommendation id.
 * @param value - validated recommendation id.
 * @returns the same string with its recommendation brand.
 */
export const RecommendationId = (value: string): RecommendationIdType => value as RecommendationIdType
