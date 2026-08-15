/**
 * 1-5-2 契约测试：clock seam 的三角色 + provider 可替换性。
 * 核心命题：consumer（clock-tool）代码不变，换 provider 行为随之换。
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { fileURLToPath } from 'node:url'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemClock from './clock-local.ts'
import FakeClock from './clock-fake.ts'
import * as ClockTool from './clock-tool.ts'

const signal = new AbortController().signal

async function setup(provider: 'system' | 'fake') {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  if (provider === 'system') await ctx.plugin(SystemClock)
  else await ctx.plugin(FakeClock, { fixedAt: 1780000000000 })
  // consumer 装载代码与 provider 选择完全正交
  await ctx.plugin(ClockTool)
  return ctx
}

let counter = 0
async function callClock(ctx: Context) {
  const result = await ctx.tools.execute({
    signal,
    callId: CallId(`clock-spec-${++counter}`),
    name: ClockTool.CLOCK_TOOL_NAME,
    arguments: {},
  })
  return result
}

describe('clock seam', () => {
  it('consumer registers clock_now against any provider', async () => {
    for (const provider of ['system', 'fake'] as const) {
      const ctx = await setup(provider)
      expect(ctx.tools.schemas().map(s => s.name)).toEqual([ClockTool.CLOCK_TOOL_NAME])
    }
  })

  it('system provider reports a time close to now', async () => {
    const ctx = await setup('system')
    const before = Date.now()
    const result = await callClock(ctx)
    const after = Date.now()
    expect(result.isError).toBe(false)
    const text = (result.content[0] as { text: string }).text
    const epoch = Number(/ \((\d+) ms\)/.exec(text)?.[1])
    expect(epoch).toBeGreaterThanOrEqual(before)
    expect(epoch).toBeLessThanOrEqual(after)
  })

  it('swapping the provider changes the answer, not the consumer', async () => {
    const ctx = await setup('fake')
    const result = await callClock(ctx)
    expect(result.isError).toBe(false)
    // FakeClock 注入的固定时刻，精确回放
    const text = (result.content[0] as { text: string }).text
    expect(text).toContain('2026-05-28T20:26:40.000Z')
    expect(text).toContain('1780000000000 ms')
  })

  it('fake provider supports advance() for deterministic testing', async () => {
    const ctx = await setup('fake')
    const clock = ctx.clock as FakeClock
    clock.advance(5000)
    expect(clock.now()).toBe(1780000005000)
    expect(clock.iso()).toBe('2026-05-28T20:26:45.000Z')
  })
})
