/**
 * Demo 驱动：模拟模型调一次 clock_now，走真实五阶段管线。
 */
import type { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'

export const name = 'demo-driver'
export const inject = ['tools', 'clock']

export function apply(ctx: Context) {
  console.log('driver sees clock:', typeof ctx.clock, '| iso:', ctx.clock.iso())
  void (async () => {
    const result = await ctx.tools.execute({
      callId: CallId('demo-clock-1'),
      name: 'clock_now',
      arguments: {},
      signal: new AbortController().signal,
    })
    console.log('isError       :', result.isError)
    console.log('model-visible :', JSON.stringify(result.content))
  })().catch((err: unknown) => {
    console.error('demo driver failed:', err)
    process.exitCode = 1
  })
}
