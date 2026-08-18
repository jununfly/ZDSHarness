import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { resolveExampleLaunch } from '@deepseek-ai/dsh-loader-smoke'

const configPath = fileURLToPath(new URL('../cordis.yml', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const repoTsconfig = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const runtimeBin = fileURLToPath(new URL('../../../packages/examples/jsonrpc-demo/src/bin.ts', import.meta.url))
const runWatchdogMs = 480_000

describe.skipIf(!process.env.DEEPSEEK_API_KEY)('tech research agent real APIs', () => {
  it('runs the fixed harness-selection corpus and publishes one healthy report', async () => {
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
    let eventCount = 0
    let lastEventType = 'none'
    let watchdog: ReturnType<typeof setTimeout> | undefined
    try {
      const run = harness.run(
        [
          'Research which harness engineering approach best fits a one-hundred-person technical team.',
          'Compare exactly earendil-works/pi, AutoJunjie/awesome-agent-harness, and deepseek-ai/deepseek-harness with one complete research brief and shared criteria.',
          'Use research_collect_evidence. Keep stars and topic match separate. Produce one concept, one candidate card per repository, a landscape diagram, one topic diagram, and operational metrics.',
          'Prepare and publish to the exact output path reports/harness-selection.md.',
        ].join(' '),
        {
          sessionId: 'tech-research-real',
          onNotification(notification) {
            if (notification.method !== 'session.event') return
            const event = notification.params.event
            if (typeof event !== 'object' || event === null || !('type' in event) || typeof event.type !== 'string') return
            eventCount++
            lastEventType = event.type
          },
        },
      )
      const timedOut = new Promise<never>((_resolve, reject) => {
        watchdog = setTimeout(() => {
          void harness.close().then(
            () => { reject(new Error(`research agent watchdog expired after ${runWatchdogMs}ms; received ${eventCount} events; last event: ${lastEventType}`)) },
            (error: unknown) => {
              reject(new AggregateError(
                [error],
                `research agent watchdog expired after ${runWatchdogMs}ms and runtime teardown failed; received ${eventCount} events; last event: ${lastEventType}`,
              ))
            },
          )
        }, runWatchdogMs)
      })
      const result = await Promise.race([run, timedOut])

      const markdownPath = join(cwd, 'reports/harness-selection.md')
      const htmlPath = join(cwd, 'reports/harness-selection.html')
      await expect(access(markdownPath)).resolves.toBeUndefined()
      await expect(access(htmlPath)).resolves.toBeUndefined()
      const markdown = await readFile(markdownPath, 'utf8')
      const html = await readFile(htmlPath, 'utf8')
      const log = JSON.stringify(result.events)
      expect(markdown).toContain('earendil-works/pi')
      expect(markdown).toContain('AutoJunjie/awesome-agent-harness')
      expect(markdown).toContain('deepseek-ai/deepseek-harness')
      expect(markdown).toContain('## 关键技术指标矩阵')
      expect(html).toContain('mermaid.initialize')
      expect(log).toContain('research_collect_evidence')
      expect(log).toContain('prepare_research_report')
      expect(log).toContain('publish_research_report')
      const publications = result.events.filter(event => event.type === 'research/report-published')
      const evaluations = result.events.filter(event => event.type === 'research/evaluation-completed')
      expect(publications).toHaveLength(1)
      expect(evaluations).toHaveLength(1)
      expect(evaluations[0]?.data).toMatchObject({
        healthy: true,
        correctness: {
          revisionPinned: true,
          provenanceComplete: true,
          criticalClaimsEvidence: true,
          scoringAxesSeparated: true,
          publishExactlyOnce: true,
          receiptConsistent: true,
        },
      })
    } finally {
      if (watchdog !== undefined) clearTimeout(watchdog)
      await harness.close()
      await rm(cwd, { recursive: true, force: true })
    }
  }, 540_000)
})
