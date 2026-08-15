import type { Context } from '@deepseek-ai/cordis'
import type {} from './greeter.ts'
import { watcher } from './watcher.ts'

// 组合者：inject 声明服务依赖 → Cordis 保证 ctx.greeter 就绪后才启动本插件。
// 挂子插件（拿 fiber 以便演示卸载）、调服务、触发事件、定时卸载验证 effect 回收。
export const name = 'main'
export const inject = ['greeter']

export async function apply(ctx: Context) {
  // ① 从代码挂一个子插件，fiber 是它的运行时句柄。
  //    fiber 是 PromiseLike：await 它 = 等子插件加载完成（listener/effect 就绪）
  const fiber = await ctx.plugin(watcher)

  // ② 消费 service：方法调用（事件在 service 内部 emit）
  const reply = ctx.greeter.greet('world')
  console.log(reply)

  // ③ 800ms 后主动卸载 watcher，观察 effect 回收
  ctx.effect(() => {
    const timer = setTimeout(async () => {
      await fiber.dispose()
      console.log('[main] watcher disposed')
      process.exit(0)
    }, 800)
    return () => clearTimeout(timer)
  })
}
