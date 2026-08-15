/**
 * 观察者插件：通过 harness 的 tools/result 事件观察应用中的每次工具调用。
 *
 * 两个插件（greet-tool 与 tool-logger）互不知晓对方存在，
 * 由注册表服务（ctx.tools）与事件（tools/result）连接——解耦广播。
 *
 * `import type {} from '@deepseek-ai/dsh-tools'` 只引入声明合并，
 * 使 'tools/result' 及其 payload 具有类型（与 04 课 stats.ts 同理，扩展到包级别）。
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'tool-logger'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    const text = result.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
    console.log(`[tool-logger] ${exec.name} -> ${text}`)
  })
}
