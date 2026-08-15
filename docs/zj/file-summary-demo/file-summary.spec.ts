/**
 * 1-5-1 契约测试：file_summary 工具走真实 LocalFileSystem + 真实执行管线。
 * 最小覆盖三条：happy path（含 fs/observed 记账）、absent 失败路径、schemas 白名单投影。
 */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { fileURLToPath } from 'node:url'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import * as FileSummaryTool from './file-summary-tool.ts'

const demoDir = fileURLToPath(new URL('.', import.meta.url))
const signal = new AbortController().signal

async function setup() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LocalFileSystem, { cwd: demoDir })
  await ctx.plugin(FileSummaryTool)
  return ctx
}

let counter = 0
function call(ctx: Context, args: unknown) {
  return ctx.tools.execute({
    signal,
    callId: CallId(`spec-${++counter}`),
    name: FileSummaryTool.FILE_SUMMARY_TOOL_NAME,
    arguments: args,
  })
}

describe('file_summary tool', () => {
  it('summarizes a file and records the present observation', async () => {
    const ctx = await setup()
    const observed = vi.fn()
    ctx.on('fs/observed', observed)

    const result = await call(ctx, { path: 'sample.txt', max_lines: 3 })
    expect(result.isError).toBe(false)
    expect(result.content[0]).toMatchObject({ type: 'text' })
    expect((result.content[0] as { text: string }).text).toContain('8 lines')
    expect((result.content[0] as { text: string }).text).toContain('1: 第 1 行')

    // 观察-守卫闭环：一次 present 记账，携带 FsVersion
    expect(observed).toHaveBeenCalledTimes(1)
    const [target, observation] = observed.mock.calls[0] as [{ displayPath: string }, { kind: string; version: object }]
    expect(target.displayPath).toContain('sample.txt')
    expect(observation.kind).toBe('present')
    expect(observation.version).toBeTruthy()
  })

  it('fails with isError for an absent file', async () => {
    const ctx = await setup()
    const result = await call(ctx, { path: 'no-such-file.txt' })
    expect(result.isError).toBe(true)
    expect((result.content[0] as { text: string }).text).toContain('no such file')
  })

  it('projects only the model-visible whitelist via schemas()', async () => {
    const ctx = await setup()
    const schemas = ctx.tools.schemas()
    expect(schemas).toHaveLength(1)
    expect(schemas[0]).toHaveProperty('name', FileSummaryTool.FILE_SUMMARY_TOOL_NAME)
    expect(schemas[0]).toHaveProperty('description')
    expect(schemas[0]).toHaveProperty('parameters')
    // 白名单：不泄露 execute/render 等实现成员
    expect(Object.keys(schemas[0]).sort()).toEqual(['description', 'name', 'parameters'])
  })
})
