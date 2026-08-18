/** Durable sealed-ledger cache with fail-closed file validation. @module @deepseek-ai/dsh-research/cache */
import { createHash, randomUUID } from 'node:crypto'
import { link, lstat, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { ResearchEvidenceCache, VerifiedEvidenceLedger } from './types.ts'

const RESEARCH_CACHE_VERSION = 'research-cache/v2'

const repositoryRefSchema = z.strictObject({ owner: z.string().min(1), name: z.string().min(1) })
const revisionSchema = z.strictObject({ sha: z.string().min(1), branch: z.string().min(1), url: z.string().min(1) })
const treeEntrySchema = z.strictObject({
  path: z.string(),
  type: z.enum(['blob', 'tree']),
  sha: z.string().min(1),
  size: z.number().int().nonnegative().optional(),
})
const ledgerSchema = z.strictObject({
  schema: z.literal('zj-verified-evidence-ledger/v1'),
  compilerVersion: z.literal('research/v1'),
  briefFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  policyVersion: z.string().min(1),
  observedAt: z.string().min(1),
  repositories: z.array(z.strictObject({ repository: repositoryRefSchema, revision: revisionSchema, tree: z.array(treeEntrySchema) })),
  candidates: z.array(
    z.strictObject({
      repository: repositoryRefSchema,
      stars: z.number().int().nonnegative(),
      topicMatch: z.number().min(0).max(100),
      origin: z.enum(['explicit', 'discovered']),
    }),
  ),
  evidence: z.array(
    z.strictObject({
      id: z.string().min(1),
      criterionId: z.string().min(1),
      repository: repositoryRefSchema,
      revision: z.string().min(1),
      path: z.string().min(1),
      sourceUrl: z.string().min(1),
      excerpt: z.string().min(1),
      kind: z.literal('canonical'),
    }),
  ),
  unknownCriteria: z.array(z.strictObject({ criterionId: z.string().min(1), repository: repositoryRefSchema })),
  navigation: z.array(
    z.strictObject({
      adapter: z.string().min(1),
      repository: repositoryRefSchema,
      status: z.enum(['used', 'unavailable', 'failed']),
      message: z.string().optional(),
    }),
  ),
  collection: z.strictObject({
    filesRead: z.number().int().nonnegative(),
    sourceBytesRead: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
    cacheHit: z.boolean(),
  }),
})

/** Filesystem cache that atomically publishes one validated JSON ledger per cache key. */
export class FileResearchEvidenceCache implements ResearchEvidenceCache {
  constructor(private readonly root: string) {}

  /** @returns the validated ledger for the exact key, or undefined when no entry exists. */
  async get(key: string): Promise<VerifiedEvidenceLedger | undefined> {
    assertCacheKey(key)
    const path = this.entryPath(key)
    let stat
    try {
      stat = await lstat(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
    if (!stat.isFile()) throw new Error(`research cache entry is not a regular file: ${path}`)
    let decoded: unknown
    try {
      decoded = JSON.parse(await readFile(path, 'utf8'))
    } catch (error) {
      throw new Error(`research cache entry is unreadable or invalid JSON: ${path}`, { cause: error })
    }
    const result = ledgerSchema.safeParse(decoded)
    if (!result.success) throw new Error(`research cache entry does not match the sealed ledger schema: ${path}`, { cause: result.error })
    const ledger = result.data as unknown as VerifiedEvidenceLedger
    if (cacheKeyForLedger(ledger) !== key) throw new Error(`research cache entry does not match its cache key: ${path}`)
    return deepFreeze(ledger)
  }

  /** Atomically create one cache entry; an existing valid entry wins a concurrent publication. */
  async set(key: string, ledger: VerifiedEvidenceLedger): Promise<void> {
    assertCacheKey(key)
    if (cacheKeyForLedger(ledger) !== key) throw new Error('research cache ledger does not match its cache key')
    const validated = ledgerSchema.parse(ledger)
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    const target = this.entryPath(key)
    const temporary = join(this.root, `.${key}.${process.pid}.${randomUUID()}.tmp`)
    await writeFile(temporary, `${JSON.stringify(validated)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    try {
      await link(temporary, target)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      await this.get(key)
    } finally {
      await unlink(temporary).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      })
    }
  }

  private entryPath(key: string): string {
    return join(this.root, `${key}.json`)
  }
}

function cacheKeyForLedger(ledger: VerifiedEvidenceLedger): string {
  return researchCacheKey(
    ledger.briefFingerprint,
    ledger.policyVersion,
    ledger.repositories.map(item => ({ owner: item.repository.owner, name: item.repository.name, sha: item.revision.sha })),
  )
}

/**
 * Compute a cache key from already-normalized compiler identities.
 * @param briefFingerprint - normalized research brief fingerprint.
 * @param policyVersion - evidence policy version applied by the compiler.
 * @param revisions - selected repositories and their immutable commit revisions.
 * @returns cache identity for one complete evidence collection.
 */
export function researchCacheKey(
  briefFingerprint: string,
  policyVersion: string,
  revisions: readonly { readonly owner: string; readonly name: string; readonly sha: string }[],
): string {
  return createHash('sha256')
    .update(JSON.stringify({ cacheVersion: RESEARCH_CACHE_VERSION, briefFingerprint, policyVersion, revisions }))
    .digest('hex')
}

function assertCacheKey(key: string): void {
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('research cache key must be a lowercase SHA-256 digest')
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}
