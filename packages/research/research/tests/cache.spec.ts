import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CriterionId, FileResearchEvidenceCache, researchCacheKey, type VerifiedEvidenceLedger } from '@deepseek-ai/dsh-research'

describe('FileResearchEvidenceCache', () => {
  it('persists a validated ledger across instances and rejects corrupted entries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-research-cache-'))
    const ledger = fixtureLedger()
    const key = researchCacheKey(
      ledger.briefFingerprint,
      ledger.policyVersion,
      ledger.repositories.map(item => ({ owner: item.repository.owner, name: item.repository.name, sha: item.revision.sha })),
    )

    try {
      await new FileResearchEvidenceCache(root).set(key, ledger)
      await expect(new FileResearchEvidenceCache(root).get(key)).resolves.toEqual(ledger)

      await writeFile(join(root, `${key}.json`), '{"schema":"wrong"}\n', 'utf8')
      await expect(new FileResearchEvidenceCache(root).get(key)).rejects.toThrow('does not match the sealed ledger schema')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

function fixtureLedger(): VerifiedEvidenceLedger {
  return {
    schema: 'zj-verified-evidence-ledger/v1',
    compilerVersion: 'research/v1',
    briefFingerprint: 'a'.repeat(64),
    policyVersion: '2026-08-18',
    observedAt: '2026-08-18T00:00:00.000Z',
    repositories: [
      { repository: { owner: 'example', name: 'harness' }, revision: { sha: 'abc123', branch: 'main', url: 'commit-url' }, tree: [] },
    ],
    candidates: [{ repository: { owner: 'example', name: 'harness' }, stars: 1, topicMatch: 100, origin: 'explicit' }],
    evidence: [],
    unknownCriteria: [{ criterionId: CriterionId('governance'), repository: { owner: 'example', name: 'harness' } }],
    navigation: [],
    collection: { filesRead: 0, sourceBytesRead: 0, durationMs: 1, cacheHit: false },
  }
}
