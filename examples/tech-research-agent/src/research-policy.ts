/** Model instructions for the technical solution research workflow. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { PostToolDecision } from '@deepseek-ai/dsh-tools'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tech-research-policy'
/** System prompt and tool pipeline receiving the workflow policy. */
export const inject = ['systemPrompt', 'tools']

/** Stable model-facing research workflow. */
export const RESEARCH_POLICY = `Complete one independent technical solution research task from the user's topic, supplied repositories, and any supplied local material.

Build one complete zj-research-brief/v1 with shared criteria for every repository. Use explicit repositories, deterministic discovery, or both. Call research_collect_evidence once; copy stars and topicMatch from its candidates, and use only its canonical items to support GitHub claims. Treat every unknownCriteria item as unknown, never as proof that a repository lacks a capability.

Build one complete zj-research-report-ir/v1. Every critical claim cites canonical Evidence IDs. Comparisons cite Claim IDs and recommendations cite Comparison IDs. Candidate stars and topicMatch remain separate fields. Every metric defines its name, unit, measurement method, applicable condition, and expected value. Include a landscape Mermaid diagram and at least one container or topic diagram. Submit the Report IR directly as tool arguments; do not reproduce the complete object in reasoning or prose first.

Call prepare_research_report with the complete Report IR and a new .md output path; the application reads the sealed ledger recorded by research_collect_evidence. If prepare returns diagnostics, correct the Report IR and prepare again. Call publish_research_report exactly once with the validated token. Markdown is the authoritative AI-readable report and HTML is derived. A GitHub rate-limit failure ends the current turn; preserve its retry time and wait for a later user-initiated turn instead of retrying.

Do not state tool-call counts, diagram counts, output paths, report hashes, elapsed time, token use, or health status yourself. The application derives those facts from the session log, sealed ledger, and publication receipt.`

/** Register the workflow policy. */
export function apply(ctx: Context): void {
  ctx.systemPrompt.section({ name: 'tech-research-policy', order: 50, text: RESEARCH_POLICY })
  ctx.on('tools/post-execute', async (exec, result, next): Promise<PostToolDecision> => {
    const decision = await next()
    if (exec.name === 'research_collect_evidence'
      && result.isError
      && result.error.info?.code === 'GITHUB_RATE_LIMITED') {
      exec.agent?.cancel({ kind: 'hook', reason: 'GitHub evidence source is rate limited' })
    }
    return decision
  })
}
