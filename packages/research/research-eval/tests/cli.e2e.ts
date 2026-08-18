import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const bin = fileURLToPath(new URL('../src/bin.ts', import.meta.url))

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
          operations: ['validate-manifest', 'project-receipt'],
          manifestSchemas: ['zj-research-experiment/v1'],
          receiptSchemas: ['zj-research-run-receipt/v1'],
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
})
