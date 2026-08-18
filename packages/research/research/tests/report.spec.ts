import { describe, expect, it } from 'vitest'
import {
  ClaimId,
  ComparisonId,
  CriterionId,
  EvidenceId,
  RecommendationId,
  compileResearchMarkdown,
  ResearchReportValidationError,
  type ResearchReportIr,
  type VerifiedEvidenceLedger,
} from '@deepseek-ai/dsh-research'

const ledger: VerifiedEvidenceLedger = {
  schema: 'zj-verified-evidence-ledger/v1',
  compilerVersion: 'research/v1',
  briefFingerprint: 'ledger-fingerprint',
  policyVersion: 'v1',
  observedAt: '2026-08-18T00:00:00.000Z',
  repositories: [],
  candidates: [{ repository: { owner: 'example', name: 'harness' }, stars: 42, topicMatch: 90, origin: 'explicit' }],
  evidence: [
    {
      id: EvidenceId('evidence-1'),
      criterionId: CriterionId('governance'),
      repository: { owner: 'example', name: 'harness' },
      revision: 'abc123',
      path: 'POLICY.md',
      sourceUrl: 'https://github.com/example/harness/blob/abc123/POLICY.md',
      excerpt: 'Hooks enforce policy.',
      kind: 'canonical',
    },
  ],
  unknownCriteria: [],
  navigation: [],
  collection: { filesRead: 1, sourceBytesRead: 21, durationMs: 10, cacheHit: false },
}

function report(): ResearchReportIr {
  return {
    schema: 'zj-research-report-ir/v1',
    family: 'technical-c4/v1',
    title: 'Harness engineering',
    summary: 'Comparison for a one-hundred-person team.',
    ledgerFingerprint: ledger.briefFingerprint,
    concepts: [{ key: 'harness', value: 'Agent execution environment' }],
    diagrams: [
      { title: 'Landscape', kind: 'landscape', mermaid: 'flowchart LR\n  Team --> Harness' },
      { title: 'Policy container', kind: 'container', mermaid: 'flowchart LR\n  Harness --> Policy' },
    ],
    candidates: [{ repository: { owner: 'example', name: 'harness' }, stars: 42, topicMatch: 90, evidenceIds: [EvidenceId('evidence-1')] }],
    cards: [{ title: 'example/harness', summary: 'Policy hooks are explicit.', claimIds: [ClaimId('claim-1')] }],
    claims: [{ id: ClaimId('claim-1'), text: 'Hooks enforce policy.', critical: true, evidenceIds: [EvidenceId('evidence-1')] }],
    comparisons: [
      { id: ComparisonId('comparison-1'), text: 'Explicit enforcement is suitable for shared governance.', claimIds: [ClaimId('claim-1')] },
    ],
    recommendations: [
      { id: RecommendationId('recommendation-1'), text: 'Adopt the explicit policy route.', comparisonIds: [ComparisonId('comparison-1')] },
    ],
    metrics: [
      {
        key: 'policy-bypass-rate',
        definition: 'Runs bypassing required policy divided by all governed runs',
        unit: '%',
        method: 'Count policy decisions and governed runs',
        condition: 'Nightly fixed suite',
        expected: '0%',
      },
    ],
  }
}

describe('Report IR', () => {
  it('compiles a deterministic technical-C4 Markdown source from linked evidence', () => {
    const markdown = compileResearchMarkdown(report(), ledger)

    expect(markdown).toContain('# 调研主题\nHarness engineering')
    expect(markdown).toContain('[[harness]]')
    expect(markdown).toContain('example/harness@abc123:POLICY.md')
    expect(markdown.match(/```mermaid/g)).toHaveLength(2)
  })

  it('rejects critical claims without canonical evidence and reports independent diagnostics together', () => {
    const base = report()
    const input: ResearchReportIr = {
      ...base,
      claims: [{ ...base.claims[0]!, evidenceIds: [] }],
      recommendations: [{ ...base.recommendations[0]!, comparisonIds: [ComparisonId('missing')] }],
    }

    let error: unknown
    try {
      compileResearchMarkdown(input, ledger)
    } catch (caught: unknown) {
      error = caught
    }
    expect(error).toBeInstanceOf(ResearchReportValidationError)
    if (!(error instanceof ResearchReportValidationError)) throw new Error('expected Report IR validation failure')
    expect(error.diagnostics).toEqual([
      'critical claim claim-1 has no evidence',
      'recommendation recommendation-1 references unknown comparison missing',
    ])
  })

  it('lists only evidence cited by the zj-draft body', () => {
    const input = report()
    const unusedEvidence = {
      ...ledger.evidence[0]!,
      id: EvidenceId('evidence-unused'),
      path: 'UNUSED.md',
      sourceUrl: 'https://github.com/example/harness/blob/abc123/UNUSED.md',
    }

    const markdown = compileResearchMarkdown(
      { ...input, family: 'zj-draft/v1' },
      { ...ledger, evidence: [...ledger.evidence, unusedEvidence] },
    )

    expect(markdown).toContain('Hooks enforce policy. [[1]](https://github.com/example/harness/blob/abc123/POLICY.md)')
    expect(markdown).toContain('1. [example/harness@abc123:POLICY.md](https://github.com/example/harness/blob/abc123/POLICY.md) — Evidence `evidence-1`')
    expect(markdown).not.toContain('UNUSED.md')
    expect(markdown).not.toContain('[[2]]')
  })
})
