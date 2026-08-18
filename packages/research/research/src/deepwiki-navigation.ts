/** DeepWiki-derived navigation that yields paths only, never canonical evidence. @module @deepseek-ai/dsh-research/deepwiki-navigation */
import type { GitHubRepositoryRef } from '@deepseek-ai/dsh-github'
import type { NavigationHint, NavigationRequest, ResearchNavigator } from './types.ts'

/** Minimal DeepWiki client used by the internal navigation adapter. */
export interface DeepWikiClient {
  /** @returns derived wiki structure for a public repository. */
  readWikiStructure(repository: string, signal?: AbortSignal): Promise<string>
  /** @returns derived answer used only to locate canonical source paths. */
  askQuestion(repository: string, question: string, signal?: AbortSignal): Promise<string>
}

/** Policy-aware DeepWiki adapter; external navigation is denied unless explicitly allowed. */
export class DeepWikiResearchNavigator implements ResearchNavigator {
  readonly id = 'deepwiki'

  constructor(
    private readonly client: DeepWikiClient,
    private readonly allowExternal: (repository: GitHubRepositoryRef) => boolean,
  ) {}

  /** @returns the explicit external-navigation policy decision for this repository. */
  available(repository: GitHubRepositoryRef): boolean {
    return this.allowExternal(repository)
  }

  /**
   * Ask DeepWiki for source paths relevant to unresolved criteria and discard its prose.
   * @param request - pinned repository tree and remaining research gaps.
   * @param signal - optional cancellation signal.
   * @returns candidate paths that exist in the canonical commit tree.
   */
  async locate(request: NavigationRequest, signal?: AbortSignal): Promise<readonly NavigationHint[]> {
    const repository = `${request.repository.repository.owner}/${request.repository.repository.name}`
    const structure = await this.client.readWikiStructure(repository, signal)
    const question = [
      'Return only repository-relative source or documentation paths that answer these criteria.',
      ...request.unresolvedCriteria.map(criterion => `- ${criterion.id}: ${criterion.question}`),
      'Do not answer the criteria. Do not infer support or non-support.',
    ].join('\n')
    const answer = await this.client.askQuestion(repository, question, signal)
    const treePaths = new Set(request.repository.tree.filter(entry => entry.type === 'blob').map(entry => entry.path))
    const excluded = new Set(request.excludedPaths)
    const paths = extractPaths(`${structure}\n${answer}`).filter(path => treePaths.has(path) && !excluded.has(path))
    return [...new Set(paths)].map(path => ({ path, criterionIds: request.unresolvedCriteria.map(criterion => criterion.id) }))
  }
}

function extractPaths(text: string): string[] {
  const paths: string[] = []
  for (const match of text.matchAll(/(?:`|\]\()([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.[A-Za-z0-9]+)(?:`|(?:#[^)]*)?\))/g)) {
    if (match[1] !== undefined) paths.push(match[1])
  }
  return paths
}
