/** Evidence-linked Report IR validation and Markdown compilation. @module @deepseek-ai/dsh-research/report */
import type { ResearchReportIr, VerifiedEvidenceLedger } from './types.ts'

/** Stable validation failure with all independently detected Report IR diagnostics. */
export class ResearchReportValidationError extends Error {
  override readonly name = 'ResearchReportValidationError'

  constructor(readonly diagnostics: readonly string[]) {
    super(`research report validation failed: ${diagnostics.join('; ')}`)
  }
}

/**
 * Validate every Evidence → Claim → Comparison → Recommendation reference.
 * @param report - report semantic input submitted by the model or skill.
 * @param ledger - sealed canonical evidence ledger.
 * @throws {@link ResearchReportValidationError} when any reference or hard requirement fails.
 */
export function validateResearchReportIr(report: ResearchReportIr, ledger: VerifiedEvidenceLedger): void {
  const diagnostics: string[] = []
  const schema: unknown = report.schema
  if (schema !== 'zj-research-report-ir/v1') diagnostics.push('unsupported report schema')
  if (report.ledgerFingerprint !== ledger.briefFingerprint) diagnostics.push('report ledgerFingerprint does not match the sealed ledger')
  const evidenceIds = new Set(ledger.evidence.map(item => item.id))
  const claimIds = uniqueIds(
    report.claims.map(item => item.id),
    'claim',
    diagnostics,
  )
  const comparisonIds = uniqueIds(
    report.comparisons.map(item => item.id),
    'comparison',
    diagnostics,
  )
  uniqueIds(
    report.recommendations.map(item => item.id),
    'recommendation',
    diagnostics,
  )
  uniqueIds(
    report.concepts.map(item => item.key),
    'concept',
    diagnostics,
  )
  for (const claim of report.claims) {
    if (claim.critical && claim.evidenceIds.length === 0) diagnostics.push(`critical claim ${claim.id} has no evidence`)
    for (const evidenceId of claim.evidenceIds)
      if (!evidenceIds.has(evidenceId)) diagnostics.push(`claim ${claim.id} references unknown evidence ${evidenceId}`)
  }
  for (const comparison of report.comparisons)
    for (const claimId of comparison.claimIds)
      if (!claimIds.has(claimId)) diagnostics.push(`comparison ${comparison.id} references unknown claim ${claimId}`)
  for (const recommendation of report.recommendations)
    for (const comparisonId of recommendation.comparisonIds)
      if (!comparisonIds.has(comparisonId))
        diagnostics.push(`recommendation ${recommendation.id} references unknown comparison ${comparisonId}`)
  const ledgerCandidates = new Map(
    ledger.candidates.map(candidate => [`${candidate.repository.owner}/${candidate.repository.name}`.toLowerCase(), candidate]),
  )
  const reportCandidateKeys = new Set<string>()
  for (const candidate of report.candidates) {
    const key = `${candidate.repository.owner}/${candidate.repository.name}`.toLowerCase()
    reportCandidateKeys.add(key)
    const source = ledgerCandidates.get(key)
    if (source === undefined)
      diagnostics.push(`report candidate ${candidate.repository.owner}/${candidate.repository.name} is absent from the sealed ledger`)
    else if (source.stars !== candidate.stars || source.topicMatch !== candidate.topicMatch)
      diagnostics.push(`report candidate ${candidate.repository.owner}/${candidate.repository.name} changes sealed stars or topicMatch`)
    for (const evidenceId of candidate.evidenceIds)
      if (!evidenceIds.has(evidenceId))
        diagnostics.push(`candidate ${candidate.repository.owner}/${candidate.repository.name} references unknown evidence ${evidenceId}`)
  }
  if (report.family === 'technical-c4/v1')
    for (const [key, candidate] of ledgerCandidates)
      if (!reportCandidateKeys.has(key))
        diagnostics.push(`report omits sealed candidate ${candidate.repository.owner}/${candidate.repository.name}`)
  if (report.family === 'technical-c4/v1' && !report.diagrams.some(diagram => diagram.kind === 'landscape'))
    diagnostics.push('report requires one landscape diagram')
  if (report.family === 'technical-c4/v1' && !report.diagrams.some(diagram => diagram.kind !== 'landscape'))
    diagnostics.push('report requires one container or topic diagram')
  for (const metric of report.metrics) {
    if (
      [metric.key, metric.definition, metric.unit, metric.method, metric.condition, metric.expected].some(
        value => value.trim().length === 0,
      )
    )
      diagnostics.push(`metric ${metric.key || '(empty)'} is not operationally defined`)
  }
  if (diagnostics.length > 0) throw new ResearchReportValidationError(diagnostics)
}

/**
 * Compile the technical-C4 report family from validated semantic input.
 * @param report - validated Report IR.
 * @param ledger - sealed evidence used for sources and observation metadata.
 * @returns authoritative Markdown report.
 */
export function compileResearchMarkdown(report: ResearchReportIr, ledger: VerifiedEvidenceLedger): string {
  validateResearchReportIr(report, ledger)
  if (report.family === 'zj-draft/v1') return compileZjDraft(report, ledger)
  const landscape = report.diagrams.filter(diagram => diagram.kind === 'landscape')
  const details = report.diagrams.filter(diagram => diagram.kind !== 'landscape')
  const lines = [
    '# 调研主题',
    report.title,
    '',
    report.summary,
    '',
    '## 输入材料与观察时间',
    `Evidence ledger: \`${ledger.briefFingerprint}\``,
    `Observed: ${ledger.observedAt}`,
    '',
    '## Key-Value 概念索引',
    ...report.concepts.map(concept => `- Key: \`${concept.key}\` — ${concept.value}`),
    '',
    `Concepts: ${report.concepts.map(concept => `[[${concept.key}]]`).join(', ')}`,
    '',
    '## C4 System Landscape',
    ...landscape.flatMap(renderDiagram),
    '## 候选项目表',
    '| Repository | Stars | Topic match |',
    '|---|---:|---:|',
    ...report.candidates.map(
      candidate => `| ${candidate.repository.owner}/${candidate.repository.name} | ${candidate.stars} | ${candidate.topicMatch} |`,
    ),
    '',
    '## 深读项目卡片',
    ...report.cards.flatMap(card => [`### ${card.title}`, card.summary, '', ...card.claimIds.map(id => `- Claim \`${id}\``), '']),
    '## 方案族及适用场景对比',
    ...report.comparisons.flatMap(comparison => [
      `### ${comparison.id}`,
      comparison.text,
      '',
      `Claims: ${comparison.claimIds.map(id => `\`${id}\``).join(', ')}`,
      '',
    ]),
    '## C4 Context/Container 与子主题图',
    ...details.flatMap(renderDiagram),
    '## 关键技术指标矩阵',
    '| Metric | Definition | Unit | Method | Condition | Expected |',
    '|---|---|---|---|---|---|',
    ...report.metrics.map(
      metric => `| ${metric.key} | ${metric.definition} | ${metric.unit} | ${metric.method} | ${metric.condition} | ${metric.expected} |`,
    ),
    '',
    '## 建议、限制与待验证事项',
    ...report.recommendations.flatMap(recommendation => [
      `### ${recommendation.id}`,
      recommendation.text,
      '',
      `Comparisons: ${recommendation.comparisonIds.map(id => `\`${id}\``).join(', ')}`,
      '',
    ]),
    ...ledger.unknownCriteria.map(item => `- Unknown: ${item.repository.owner}/${item.repository.name} / ${item.criterionId}`),
    '',
    '## 来源清单',
    ...ledger.evidence.map(
      item =>
        `- [${item.repository.owner}/${item.repository.name}@${item.revision}:${item.path}](${item.sourceUrl}) — Evidence \`${item.id}\``,
    ),
    '',
  ]
  return lines.join('\n')
}

function compileZjDraft(report: ResearchReportIr, ledger: VerifiedEvidenceLedger): string {
  const referencedEvidenceIds = new Set(report.claims.flatMap(claim => claim.evidenceIds))
  const referencedEvidence = ledger.evidence.filter(item => referencedEvidenceIds.has(item.id))
  const sourceNumbers = new Map(referencedEvidence.map((item, index) => [item.id, index + 1]))
  const evidenceById = new Map(referencedEvidence.map(item => [item.id, item]))
  const claimLines = report.claims.map((claim) => {
    const citations = [...new Set(claim.evidenceIds)].map((id) => {
      const evidence = evidenceById.get(id)
      const sourceNumber = sourceNumbers.get(id)
      return evidence === undefined || sourceNumber === undefined ? '' : ` [[${sourceNumber}]](${evidence.sourceUrl})`
    }).join('')
    return `- ${claim.text}${citations}`
  })
  const lines = [
    `# ${report.title}`,
    '',
    '## 1. Executive summary',
    report.summary,
    '',
    ...report.recommendations.map(item => `- ${item.text}`),
    '',
    '## 2. Key findings',
    ...claimLines,
    '',
    '## 3. Analysis & synthesis',
    ...report.comparisons.flatMap(item => [`### ${item.id}`, item.text, '']),
    ...(report.recommendations.length === 0
      ? []
      : ['### 3.7 Recommendation', ...report.recommendations.map(item => `- ${item.text}`), '']),
    '## 4. Information gaps & next steps',
    '| Gap | Nature | Next step |',
    '|---|---|---|',
    ...ledger.unknownCriteria.map(
      item => `| ${item.repository.owner}/${item.repository.name}: ${item.criterionId} | unverified | collect canonical evidence |`,
    ),
    '',
    '## 6. Source list',
    ...referencedEvidence.map(
      item =>
        `${sourceNumbers.get(item.id)}. [${item.repository.owner}/${item.repository.name}@${item.revision}:${item.path}](${item.sourceUrl}) — Evidence \`${item.id}\``,
    ),
    '',
  ]
  return lines.join('\n')
}

function uniqueIds<T extends string>(ids: readonly T[], kind: string, diagnostics: string[]): Set<T> {
  const result = new Set<T>()
  for (const id of ids) {
    if (result.has(id)) diagnostics.push(`duplicate ${kind} id ${id}`)
    result.add(id)
  }
  return result
}

function renderDiagram(diagram: { readonly title: string; readonly mermaid: string }): string[] {
  return [`### ${diagram.title}`, '```mermaid', diagram.mermaid, '```', '']
}
