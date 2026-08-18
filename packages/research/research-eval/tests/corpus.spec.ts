import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expandResearchExperiment, parseResearchExperimentManifest } from '@deepseek-ai/dsh-research-eval'
import { describe, expect, it } from 'vitest'

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(fileURLToPath(new URL(`fixtures/${name}`, import.meta.url)), 'utf8')) as unknown
}

describe('research evaluation corpus fixtures', () => {
  it('expands ten bilingual quality cases into 30 samples per arm', async () => {
    const manifest = parseResearchExperimentManifest(await fixture('controlled-quality-v1.manifest.json'))
    const selections = expandResearchExperiment(manifest)
    expect(manifest.cases).toHaveLength(10)
    expect(new Set(manifest.cases.map(item => item.language))).toEqual(new Set(['en', 'zh']))
    expect(new Set(manifest.cases.map(item => item.scenario))).toEqual(new Set([
      'multi-repository-selection',
      'single-repository-deep-read',
      'insufficient-evidence',
      'conflicting-evidence',
      'navigation-degraded',
    ]))
    expect(selections.filter(item => item.armId === 'agent')).toHaveLength(30)
    expect(selections.filter(item => item.armId === 'skill')).toHaveLength(30)
  })

  it('keeps expected upstream failures in a separate reliability matrix', async () => {
    const manifest = parseResearchExperimentManifest(await fixture('reliability-v1.manifest.json'))
    expect(manifest.cases.every(item => item.purpose === 'reliability' && item.scenario === 'upstream-failure')).toBe(true)
    expect(expandResearchExperiment(manifest)).toHaveLength(8)
  })
})
