/**
 * 角色三：Consumer（对位 dsh-tool-fs）。
 *
 * inject ['clock','tools']：硬依赖 seam + 工具注册表；
 * 只面向 ClockService 抽象编程——背后是 SystemClock 还是 FakeClock 它不知道。
 * 注册 clock_now 工具：规范值 { iso, epochMs }，render 投影模型可见文本。
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const CLOCK_TOOL_NAME = 'clock_now'

export const name = 'clock-tool'
export const inject = ['clock', 'tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: CLOCK_TOOL_NAME,
    description: 'Report the current time from the ambient clock service.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          iso: { type: 'string', required: true },
          epochMs: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `now: ${value.iso} (${value.epochMs} ms)` }],
    },
    async execute(_args, exec) {
      if (exec.signal.aborted) throw new Error('clock_now aborted before dispatch')
      return { iso: ctx.clock.iso(), epochMs: ctx.clock.now() }
    },
  }))
}
