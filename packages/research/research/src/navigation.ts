/** Deterministic fallback navigation for research evidence collection. @module @deepseek-ai/dsh-research/navigation */
import type { NavigationHint, NavigationRequest, ResearchNavigator } from './types.ts'

/** Path and manifest navigator available for public and private repositories. */
export class HeuristicResearchNavigator implements ResearchNavigator {
  readonly id = 'heuristic'

  /** @returns true because navigation uses only the already-fetched canonical tree. */
  available(): boolean {
    return true
  }

  /**
   * Rank documentation and manifest paths against unresolved criterion keywords.
   * @param request - repository tree, unresolved criteria, and previously read paths.
   * @returns candidate paths with the criteria that selected them.
   */
  locate(request: NavigationRequest): Promise<readonly NavigationHint[]> {
    const excluded = new Set(request.excludedPaths)
    const hints = request.repository.tree.flatMap((entry) => {
      if (entry.type !== 'blob' || excluded.has(entry.path) || !isCanonicalPath(entry.path)) return []
      const criterionIds = request.unresolvedCriteria
        .filter(criterion => criterion.keywords.some(keyword => entry.path.toLowerCase().includes(keyword.toLowerCase())))
        .map(criterion => criterion.id)
      return criterionIds.length === 0 ? [] : [{ path: entry.path, criterionIds }]
    })
    if (hints.length > 0) return Promise.resolve(hints)
    return Promise.resolve(
      request.repository.tree.flatMap(entry =>
        entry.type === 'blob' &&
        !excluded.has(entry.path) &&
        ['readme.md', 'package.json', 'pyproject.toml', 'go.mod'].includes(entry.path.toLowerCase())
          ? [{ path: entry.path, criterionIds: request.unresolvedCriteria.map(criterion => criterion.id) }]
          : [],
      ),
    )
  }
}

function isCanonicalPath(path: string): boolean {
  return (
    /(^|\/)docs?\/.*\.(md|markdown)$/i.test(path) ||
    /(^|\/)(readme|agent|claude|architecture)[^/]*\.(md|markdown)$/i.test(path) ||
    /(^|\/)(package\.json|pyproject\.toml|go\.mod|cargo\.toml|dockerfile|docker-compose\.ya?ml)$/i.test(path)
  )
}
