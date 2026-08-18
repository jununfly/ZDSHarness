import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const bin = fileURLToPath(new URL('../src/bin.ts', import.meta.url))

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(fileURLToPath(new URL(`fixtures/${name}`, import.meta.url)), 'utf8')) as unknown
}

function invoke(request: unknown): Promise<{ readonly code: number | null; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx/esm', bin], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += String(chunk) })
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('close', (code) => { resolve({ code, stdout, stderr }) })
    child.stdin.end(JSON.stringify(request))
  })
}

describe('research eval CLI', () => {
  it('describes exact versioned schemas without loading an arm', async () => {
    const result = await invoke({ protocol: 'zj-research-eval-cli/v1', operation: 'describe' })
    expect(result).toEqual({
      code: 0,
      stderr: '',
      stdout: `${JSON.stringify({
        protocol: 'zj-research-eval-cli/v1',
        operation: 'describe',
        result: {
          operations: ['validate-manifest', 'validate-assets', 'calibrate-judge', 'project-receipt'],
          manifestSchemas: ['zj-research-experiment/v1'],
          evaluationAssetSchemas: ['zj-research-rubric-set/v1', 'zj-research-human-annotation-set/v1', 'zj-research-judge-calibration-set/v1'],
          receiptSchemas: ['zj-research-run-receipt/v2'],
        },
      })}\n`,
    })
  })

  it('fails loud on an incompatible protocol without polluting stdout', async () => {
    const result = await invoke({ protocol: 'zj-research-eval-cli/v0', operation: 'describe' })
    expect(result.code).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('unsupported research eval CLI protocol')
  })

  it('validates the complete keyless evaluation asset set through the process entry', async () => {
    const result = await invoke({
      protocol: 'zj-research-eval-cli/v1',
      operation: 'validate-assets',
      manifest: await fixture('controlled-quality-v1.manifest.json'),
      rubrics: await fixture('controlled-quality-v1.rubrics.json'),
      annotations: await fixture('controlled-quality-v1.annotations.json'),
      calibration: await fixture('controlled-quality-v1.calibration.json'),
    })
    expect(result.code).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toMatchObject({
      protocol: 'zj-research-eval-cli/v1',
      operation: 'validate-assets',
      result: { qualityCaseCount: 10, calibration: { passed: true } },
    })
  })
})
