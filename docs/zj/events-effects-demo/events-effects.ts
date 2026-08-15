/**
 * 1-3-2 掌握 effects 与事件模型 —— 实证 demo
 *
 * 覆盖（对应 cordis-tutorial 02/04 课）：
 *  - ctx.on / ctx.emit：声明式监听 + 同步广播（fan-out），监听器随插件卸载自动移除
 *  - 事件分发 5 模式：emit / serial / bail / waterfall / parallel
 *  - ctx.effect：Cordis 不管理的资源（计时器等）包装进生命周期，卸载时自动回收
 *  - ctx.plugin：挂子插件（返回 fiber），fiber.dispose() 递归卸载 + 触发 effect 清理
 *
 * 运行：cd docs/zj/events-effects-demo && node --import tsx ../../../vendor/cordis/bin.js
 */
import { type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'demo/ping'(seq: number): void
    'demo/answer'(prompt: string): Promise<string | null>
    'demo/answer-bail'(prompt: string): string | null
    'demo/transform'(input: string, next: () => Promise<string>): Promise<string>
    'demo/parallel'(n: number): Promise<void>
  }
}

export const name = 'events-effects-demo'

/** 子插件：effect 生命周期演示（心跳计时器，dispose 时回收） */
function heartbeat(ctx: Context) {
  ctx.effect(() => {
    const timer = setInterval(() => console.log('  [effect] tick'), 120)
    return () => {
      clearInterval(timer)
      console.log('  [effect] heartbeat cleaned up')
    }
  })
}

export function apply(ctx: Context) {
  // ① emit：同步广播——一个事件到达所有监听器，监听器互不知晓
  ctx.on('demo/ping', (seq) => console.log(`  listener A got ping #${seq}`))
  ctx.on('demo/ping', (seq) => console.log(`  listener B got ping #${seq}`))

  // ② serial：监听器顺序等待；第一个非 null/false/undefined 返回值胜出并停止后续
  ctx.on('demo/answer', async () => null)          // 让过
  ctx.on('demo/answer', async () => 'B answered')  // 胜出

  // ③ bail：serial 的同步版本
  ctx.on('demo/answer-bail', () => null)           // 让过
  ctx.on('demo/answer-bail', () => 'A answered')   // 胜出

  // ④ waterfall：环绕中间件。每个监听器拿到 next()，可转换返回值或不调 next 直接短路（否决）
  ctx.on('demo/transform', async (input, next) => {
    const downstream = await next()
    return downstream.toUpperCase()                          // 包装下游结果
  })
  ctx.on('demo/transform', async (input, next) => {
    if (input.includes('blocked')) return '** blocked **'    // 否决：不调 next，吞掉下游
    return next()
  })

  // ⑤ parallel：所有监听器并发运行，一同等待（Promise<void>，不收集返回值）
  ctx.on('demo/parallel', async (n) => {
    await new Promise((r) => setTimeout(r, 40))
    console.log(`  parallel listener 1 done (n=${n})`)
  })
  ctx.on('demo/parallel', async (n) => {
    await new Promise((r) => setTimeout(r, 20))
    console.log(`  parallel listener 2 done (n=${n})`)
  })

  // 挂子插件并保留 fiber；ctx.plugin 返回 PromiseLike，await 确保其加载完成
  const fiber = ctx.plugin(heartbeat)

  void (async () => {
    await fiber
    console.log('[1] emit：1 次广播 → 所有监听器同步收到（fan-out）')
    ctx.emit('demo/ping', 1)
    ctx.emit('demo/ping', 2)

    console.log('[2] serial：顺序等待，首个非空返回值胜出并停止后续')
    console.log(`  -> ${await ctx.serial('demo/answer', 'who?')}`)

    console.log('[3] bail：serial 的同步版本')
    console.log(`  -> ${ctx.bail('demo/answer-bail', 'who?')}`)

    console.log('[4] waterfall：中间件链可包装下游，也可否决短路')
    console.log(`  -> ${await ctx.waterfall('demo/transform', 'hello', async () => 'hello')}`)
    console.log(`  -> ${await ctx.waterfall('demo/transform', 'blocked words', async () => 'blocked words')}`)

    console.log('[5] parallel：并发等待全部监听器')
    await ctx.parallel('demo/parallel', 3)

    console.log('[6] effect 生命周期：fiber.dispose() 触发清理')
    setTimeout(async () => {
      await fiber.dispose()
      console.log('  [main] fiber disposed；之后不再有 tick（回收真实）')
      process.exit(0)
    }, 400)
  })()
}
