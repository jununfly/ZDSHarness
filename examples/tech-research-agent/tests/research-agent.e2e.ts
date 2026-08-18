import { createHash } from 'node:crypto'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { resolveExampleLaunch } from '@deepseek-ai/dsh-loader-smoke'
import {
  ResearchArmId,
  ResearchCaseId,
  ResearchExperimentId,
  ResearchExperimentRuntime,
  type ResearchExperimentEvent,
  type ResearchExperimentManifest,
} from '@deepseek-ai/dsh-research-eval'

const configPath = fileURLToPath(new URL('../cordis.yml', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const repoTsconfig = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const runtimeBin = fileURLToPath(new URL('../../../packages/examples/jsonrpc-demo/src/bin.ts', import.meta.url))
const runWatchdogMs = 480_000

describe.skipIf(!process.env.DEEPSEEK_API_KEY)('tech research agent real APIs', () => {
  it('runs the fixed harness-selection corpus and publishes one healthy report', { timeout: 540_000, retry: 0 }, async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-tech-research-real-'))
    const launch = resolveExampleLaunch({ srcBin: runtimeBin, configArgs: [], tsconfigPath: repoTsconfig })
    const harness = new DeepSeekHarness({
      launch: {
        command: launch.command,
        args: launch.args,
        cwd: repoRoot,
        env: {
          ...process.env,
          ...launch.env,
          DSH_CORDIS_CONFIG: configPath,
          DSH_CWD: cwd,
          DSH_SESSION_ROOT: join(cwd, '.sessions'),
        },
      },
      cwd,
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
    })
    try {
      const compilerArtifact = await readFile(fileURLToPath(new URL('../../../packages/research/research-cli/lib/bin.js', import.meta.url)))
      const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
      const manifest: ResearchExperimentManifest = {
        schema: 'zj-research-experiment/v1',
        id: ResearchExperimentId('tech-research-native-smoke-v1'),
        lane: 'native',
        corpusVersion: 'real-api-smoke/v1',
        compiler: { version: 'research/v1', artifactSha256: hash(compilerArtifact) },
        policyVersion: 'public-github/v1',
        model: { provider: 'deepseek-official', id: 'deepseek-v4-flash', configFingerprint: hash('deepseek-v4-flash:maxTokens=32768') },
        judge: { id: 'smoke-judge', promptVersion: 'fixture/v1', configFingerprint: hash('fixed-smoke-scores/v1') },
        reportFamily: 'technical-c4/v1',
        cacheCohort: 'cold',
        navigationFingerprint: hash('deepwiki+heuristic:public-allowlist/v1'),
        repetitions: 1,
        budget: { maxDurationMs: runWatchdogMs, maxInputTokens: 4_000_000, maxOutputTokens: 131_072, maxSourceBytes: 1_000_000 },
        arms: [
          { id: ResearchArmId('agent'), adapter: 'native-agent' },
          { id: ResearchArmId('skill'), adapter: 'native-skill' },
        ],
        cases: [{
          id: ResearchCaseId('harness-selection'),
          language: 'en',
          purpose: 'quality',
          scenario: 'multi-repository-selection',
          briefFingerprint: hash('native prompt constructs its own brief'),
          rubricVersion: 'smoke/v1',
        }],
      }
      const lifecycle: ResearchExperimentEvent[] = []
      let armFailure: unknown
      const receipt = await new ResearchExperimentRuntime().run(
        manifest,
        { caseId: ResearchCaseId('harness-selection'), armId: ResearchArmId('agent'), repetition: 1 },
        {
          id: 'native-agent',
          async run(_request, signal) {
            const onAbort = () => { void harness.close() }
            signal.addEventListener('abort', onAbort, { once: true })
            try {
              const result = await harness.run(
                [
                  'Research which harness engineering approach best fits a one-hundred-person technical team.',
                  'Compare exactly earendil-works/pi, AutoJunjie/awesome-agent-harness, and deepseek-ai/deepseek-harness with one complete research brief and shared criteria.',
                  'Use research_collect_evidence. Keep stars and topic match separate. Produce one concept, one candidate card per repository, a landscape diagram, one topic diagram, and operational metrics.',
                  'Prepare and publish to the exact output path reports/harness-selection.md.',
                ].join(' '),
                { sessionId: 'tech-research-real' },
              )
              const publication = result.events.find(event => event.type === 'research/report-published')
              const evaluation = result.events.find(event => event.type === 'research/evaluation-completed')
              if (publication?.type !== 'research/report-published' || evaluation?.type !== 'research/evaluation-completed') {
                const diagnostics = result.events.flatMap<string>((event) => {
                  if (event.type === 'assistant/message') return [JSON.stringify({ type: event.type, content: event.data.message.content })]
                  if (event.type === 'tool/call') return [JSON.stringify({ type: event.type, name: event.data.name })]
                  if (event.type === 'tool/result') return [JSON.stringify({ type: event.type, error: event.data.error, content: event.data.message.content })]
                  if (event.type === 'turn/end') return [JSON.stringify({ type: event.type, reason: event.data.reason })]
                  return []
                })
                throw new Error(`research agent completed without publication and evaluation facts: ${diagnostics.join('\n').slice(0, 12_000)}`)
              }
              const markdown = await readFile(publication.data.markdownPath, 'utf8')
              const html = await readFile(publication.data.htmlPath, 'utf8')
              const usage = result.events.reduce((total, event) => {
                if (event.type !== 'assistant/message' || event.data.usage === undefined) return total
                return {
                  inputTokens: total.inputTokens + event.data.usage.inputTokens,
                  outputTokens: total.outputTokens + event.data.usage.outputTokens,
                  reasoningTokens: total.reasoningTokens + (event.data.usage.reasoningTokens ?? 0),
                }
              }, { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 })
              expect(markdown).toContain('earendil-works/pi')
              expect(markdown).toContain('AutoJunjie/awesome-agent-harness')
              expect(markdown).toContain('deepseek-ai/deepseek-harness')
              expect(markdown).toContain('## 关键技术指标矩阵')
              expect(html).toContain('mermaid.initialize')
              const log = JSON.stringify(result.events)
              expect(log).toContain('research_collect_evidence')
              expect(log).toContain('prepare_research_report')
              expect(log).toContain('publish_research_report')
              return {
                report: {
                  hash: evaluation.data.reportHash,
                  family: evaluation.data.reportFamily,
                  recommendationFingerprint: hash(markdown),
                },
                publication: { markdownPath: publication.data.markdownPath, htmlPath: publication.data.htmlPath, publishCount: 1 },
                structural: {
                  revisionPinned: evaluation.data.correctness.revisionPinned,
                  provenanceComplete: evaluation.data.correctness.provenanceComplete,
                  evidenceGraphComplete: evaluation.data.correctness.criticalClaimsEvidence,
                  scoringAxesSeparated: evaluation.data.correctness.scoringAxesSeparated,
                  publishExactlyOnce: evaluation.data.correctness.publishExactlyOnce,
                  receiptConsistent: evaluation.data.correctness.receiptConsistent,
                },
                collection: evaluation.data.collection,
                usage,
              }
            } catch (error) {
              armFailure = error
              throw error
            } finally {
              signal.removeEventListener('abort', onAbort)
            }
          },
        },
        {
          id: 'smoke-judge',
          evaluate: () => Promise.resolve({
            evidenceQuality: { criticalCoverage: 100, entailment: 100, unknownCorrectness: 100, provenanceCompleteness: 100 },
            decisionUsefulness: { rubricScore: 100, recommendationAcceptable: true, keyRisksOmitted: 0 },
          }),
        },
        { append(event) { lifecycle.push(event); return Promise.resolve() } },
      )
      if (receipt.health.operational.outcome === 'failed' && armFailure !== undefined)
        throw new AggregateError([armFailure], `research experiment arm failed with ${receipt.health.operational.failureClass}`)
      expect(receipt.health).toMatchObject({ overall: 'evaluated', hardGatePassed: true, operational: { outcome: 'completed' } })
      expect(lifecycle.map(event => event.type)).toEqual(['research-eval/run-started', 'research-eval/run-completed'])
      await expect(access(receipt.publication!.markdownPath)).resolves.toBeUndefined()
      await expect(access(receipt.publication!.htmlPath)).resolves.toBeUndefined()
    } finally {
      await harness.close()
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
