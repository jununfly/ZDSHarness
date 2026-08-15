# events-effects-demo — effects 与事件模型实证

路线图节点 **1-3-2**（掌握 effects 与事件模型）的可运行实证。

## 运行

```sh
cd docs/zj/events-effects-demo && node --import tsx ../../../vendor/cordis/bin.js
```

## 实际输出

```
[1] emit：1 次广播 → 所有监听器同步收到（fan-out）
  listener A got ping #1
  listener B got ping #1
  listener A got ping #2
  listener B got ping #2
[2] serial：顺序等待，首个非空返回值胜出并停止后续
  -> B answered
[3] bail：serial 的同步版本
  -> A answered
[4] waterfall：中间件链可包装下游，也可否决短路
  -> HELLO
  -> ** BLOCKED **
[5] parallel：并发等待全部监听器
  parallel listener 2 done (n=3)
  parallel listener 1 done (n=3)
[6] effect 生命周期：fiber.dispose() 触发清理
  [effect] tick
  [effect] tick
  [effect] tick
  [effect] heartbeat cleaned up
  [main] fiber disposed；之后不再有 tick（回收真实）
```

## 六个演示点对应的心智模型

| 演示 | 机制 | 关键纪律 |
|---|---|---|
| [1] emit | 同步广播，1 次 emit → 所有监听器，监听器互不知晓 | `ctx.on` 本身是 effect：卸载自动移除，无需手动 removeListener |
| [2] serial | 顺序等待，首个非 `null`/`false`/`undefined` 胜出并停止后续 | harness 事件（如 `agent/turn-stopping`）用它实现"谁先应答谁生效" |
| [3] bail | serial 的同步版本 | 同步决策场景（如 `approval/request` 的同步策略） |
| [4] waterfall | 环绕中间件：`next()` 可转换下游结果；不调 `next()` 即否决短路 | **观察者必须调 `next()`**，否则会悄无声息吞掉下游默认行为——仓库常设规则 |
| [5] parallel | 并发运行、一同等待（`Promise<void>`），不收集返回值 | 与结果收集无关的并行 fan-out（listener 2 先完成实证并发） |
| [6] effect | `ctx.effect(cb)` 主体加载时运行，返回的 disposer 卸载时运行；`fiber.dispose()` 递归卸载子插件并回卷全部 effect | 资源获取即注册，生命周期归 Cordis 管；disposer 逆序执行、异步 disposer 并发 |

## 5 模式典型用法

五种分发策略全部实现于 `EventsService`（`vendor/cordis/src/events.ts`，约 40 行）。
「让过/胜出」判据统一为 `isBailed(v)`：`v !== null && v !== false && v !== undefined`。

### ① emit — 同步扇出

```ts
ctx.on('demo/ping', (seq) => console.log(`A got #${seq}`))   // 同步函数，返回 void
ctx.on('demo/ping', (seq) => console.log(`B got #${seq}`))
ctx.emit('demo/ping', 1)   // 同步返回；不等待、不收集返回值
```

实现核心（events.ts:194）：

```ts
emit(...args) { this.dispatch('emit', args).map(cb => cb(...args)) }
```

### ② serial — 顺序 await，首个非空胜出

```ts
ctx.on('demo/answer', async () => null)          // 让过
ctx.on('demo/answer', async () => 'B answered')  // 胜出，停止后续
const answer = await ctx.serial('demo/answer', 'who?')  // -> 'B answered'
```

实现核心（events.ts:204）：

```ts
async serial(...args) {
  for (const cb of this.dispatch('serial', args)) {
    const result = await cb(...args)
    if (isBailed(result)) return result
  }
}
```

### ③ bail — serial 的同步版

```ts
ctx.on('demo/answer-bail', () => null)          // 让过
ctx.on('demo/answer-bail', () => 'A answered')  // 同步胜出
const answer = ctx.bail('demo/answer-bail', 'who?')  // 无 await，同步返回
```

实现核心（events.ts:217）：与 serial 是同一个「顺序短路」循环，唯一区别是 `cb(...args)` 不 await。

### ④ waterfall — 洋葱中间件

```ts
ctx.on('demo/transform', async (input, next) => {
  const downstream = await next()
  return downstream.toUpperCase()                          // 包装下游结果
})
ctx.on('demo/transform', async (input, next) => {
  if (input.includes('blocked')) return '** blocked **'    // 否决：不调 next，吞掉下游
  return next()
})
await ctx.waterfall('demo/transform', 'hello', async () => 'hello')
```

实现核心（events.ts:234）：

```ts
waterfall(...args) {
  const cbs = this.dispatch('waterfall', args)
  const inner = args.pop()                          // 最后一个参数 = 内置行为
  const next = () => (cbs.shift() ?? inner)(...args)
  args.push(next)
  return next()                                     // 最外层监听器先执行
}
```

### ⑤ parallel — 并发全部，错误聚合

```ts
ctx.on('demo/parallel', async (n) => {
  await new Promise((r) => setTimeout(r, 40))
  console.log('parallel listener 1 done')
})
ctx.on('demo/parallel', async (n) => {
  await new Promise((r) => setTimeout(r, 20))
  console.log('parallel listener 2 done')
})
await ctx.parallel('demo/parallel', 3)   // 等全部 settle；任一 reject 抛 AggregateError
```

实现核心（events.ts:183）：

```ts
async parallel(...args) {
  const results = await Promise.allSettled(this.dispatch('emit', args).map(async cb => cb(...args)))
  const errors = results.filter(r => r.status === 'rejected')
  if (errors.length) throw new AggregateError(errors.map(e => e.reason))
}
```

要点：
- **serial 与 bail 是同一个「顺序短路」机制**，只差一个 `await`；emit 与 parallel 也共用 `dispatch('emit')` 分发
- **waterfall 的 `next` 是闭包**：`cbs.shift() ?? inner` 依次取监听器，取尽后落到调用方传入的内置行为——所以「不调 next = 否决整条链」
- **观察者纪律**：只负责观察/标注的监听器必须调 `next()`，否则悄无声息吞掉下游默认行为（仓库常设规则，见全景文档）

## 关联

- 教程：`docs/cordis-tutorial/02-lifecycle-and-effects.md`、`04-events.md`
- 全景文档：`docs/zj/architecture_panorama.md` → L3「插件形态与注册原语」→ effects/events 子节
- 上一步：`docs/zj/plugin-philosophy-demo/`（1-2-3：service/事件/effect 三要素的最小切片）
