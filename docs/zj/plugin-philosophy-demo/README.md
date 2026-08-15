# 最小 Cordis 插件 Demo — 一切皆插件的实证

> 路线图节点 1-2-3（理解一切皆插件哲学）的验收物 B：一个可运行的最小插件组合，
> 证明"没有特权核"不是文档话术——注册即 effect，卸载即回收。

## 运行

```sh
cd docs/zj/plugin-philosophy-demo
node --import tsx ../../../vendor/cordis/bin.js
```

## 预期输出

```
[event] greet/hello: world
Hello, world!
[effect] tick
[effect] tick
[effect] tick
[effect] watcher timer cleaned up
[main] watcher disposed
```

## 四个文件

| 文件 | 角色 | 演示点 |
|---|---|---|
| `greeter.ts` | Service 提供者 | 类插件：`extends Service` + `super(ctx, 'greeter')` 注册服务；`declare module` 声明 `Context.greeter` 与 `Events['greet/hello']`（零运行时开销的类型接线） |
| `watcher.ts` | 函数插件（子插件） | `ctx.on()` 监听事件（effect，卸载自动移除）；`ctx.effect()` 包住计时器并返回 disposer（卸载时清理） |
| `main.ts` | 组合者 | `inject: ['greeter']` 声明服务依赖；`ctx.plugin(watcher)` 代码挂载子插件；800ms 后 `fiber.dispose()` 主动卸载，观察回收 |
| `cordis.yml` | 组合清单 | 插件入口列表；加载顺序无关，启动顺序由 `inject` 决定 |

## 输出解读（对应五思想）

1. **`Hello, world!`** — service 注册成功、消费者经 `ctx.greeter` 取到能力。消费者 import 的是接口名（`'greeter'`），不是实现——换 provider 不用改消费者。
2. **`[event] greet/hello: world`** — service 内部 `this.ctx.emit()` 广播，`ctx.on` 监听者收到。事件是解耦通信：发出方不知道谁在听。
3. **`[effect] tick` × 3** — `ctx.effect()` 注册的非 Cordis 资源（计时器）在运行。
4. **`[effect] watcher timer cleaned up`** — `fiber.dispose()` 触发卸载，effect 的 disposer 被调用，计时器清理。**没有手动 removeListener / clearInterval 的簿记**。
5. **`[main] watcher disposed`** — 卸载完成，且后续不再有 tick（回收是真实的，不是日志表演）。

## 两个值得注意的坑（实测）

- `ctx.plugin()` 返回的 fiber 是 **PromiseLike**：`await ctx.plugin(watcher)` 等子插件**加载完成**（listener 就绪）再往下走。不 await 直接同步调用 service，事件会丢（listener 还没注册）。
- `super(ctx, 'greeter')` 的字符串 key 是运行时注册名；`declare module` 是编译期类型接线，两者配合才完整——只有运行时没有类型，消费者失去类型安全；只有类型没有运行时，服务不存在。

## 哲学落点

这个 15 行 demo 内没有一行"框架引导代码"：没有 main() 手写启动顺序、没有手动生命周期管理、没有 import 具体实现。插件描述自己贡献什么（服务/监听/effect），`cordis.yml` 组合，Cordis 负责生命周期。dsh 里 `ctx.tools`、`ctx.llm`、`ctx.sessions` 乃至 agent loop 本身都是这样挂上去的插件——这就是"无特权核"的实证。
