import type { Context } from '@deepseek-ai/cordis'
import type {} from './greeter.ts'

// 函数插件：ctx.plugin(fn) 直接挂载，无需 apply 字段。
// 卸载时：ctx.on / ctx.effect 注册的一切自动回收。
export function watcher(ctx: Context) {
  // ① 监听事件 —— ctx.on 是 effect，插件卸载时 listener 自动移除
  ctx.on('greet/hello', (who) => {
    console.log(`[event] greet/hello: ${who}`)
  })

  // ② 非 Cordis 管理的资源（计时器）用 ctx.effect 包一层，返回 disposer
  ctx.effect(() => {
    const timer = setInterval(() => console.log('[effect] tick'), 200)
    return () => {
      clearInterval(timer)
      console.log('[effect] watcher timer cleaned up')
    }
  })
}
