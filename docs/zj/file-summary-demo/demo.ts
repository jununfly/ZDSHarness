/**
 * Demo 驱动：用代码模拟模型，驱动一次真实工具调用（与 harness-tool-demo 同款）。
 * 全程无需密钥、不调模型——ctx.tools.execute 走完整的五阶段执行管线。
 */
import type { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'

export const name = 'demo-driver'
export const inject = ['tools']

export function apply(ctx: Context) {
  void (async () => {
    const result = await ctx.tools.execute({
      callId: CallId('demo-fs-1'),
      name: 'file_summary',
      arguments: { path: 'sample.txt', max_lines: 3 },
      signal: new AbortController().signal,
    })
    console.log('isError        :', result.isError)
    console.log('model-visible  :', JSON.stringify(result.content))
  })().catch((err: unknown) => {
    console.error('demo driver failed:', err)
    process.exitCode = 1
  })
}
