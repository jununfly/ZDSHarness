# clock-seam-demo — 最小三角色：Service Definition → Provider → Consumer（1-5-2）

路线图节点 **1-5-2**（理解 provider/Consumer 扩展点）的产出：自造一个轻 seam（clock 时间服务），
把 capability seam 三角色亲手走一遍，并实证 **provider 可替换、consumer 无感**。
全程无需密钥、不调模型。

## 三角色 ↔ fs 三件套对位

| 本 demo | upstream 对位 | 职责 |
|---|---|---|
| `clock-definition.ts` | `dsh-fs`（packages/fs/fs） | 抽象服务类 + `declare module` 声明合并（`ctx.clock` 类型）；不是插件，不进 yml |
| `clock-local.ts` / `clock-fake.ts` | `dsh-fs-local` / 测试 FakeFs、`dsh-fs-sandbox`、`dsh-fs-e2b` | Service 子类 default 导出即插件：构造经 `super(ctx, 'clock')` 自注册 |
| `clock-tool.ts` | `dsh-tool-fs` | `inject: ['clock','tools']`，只面向抽象编程，注册 `clock_now` 工具 |

## 运行

```sh
cd docs/zj/clock-seam-demo && node --import tsx ../../../vendor/cordis/bin.js
```

实际输出（SystemClock）：

```
driver sees clock: object | iso: 2026-08-15T17:12:14.257Z
isError       : false
model-visible : [{"type":"text","text":"now: 2026-08-15T17:12:14.259Z (1786813934259 ms)"}]
```

## Provider 替换实验（核心命题）

cordis.yml 只改一行：`'./clock-local.ts'` → `'./clock-fake.ts'` + `config: { fixedAt: 1780000000000 }`。

```
driver sees clock: object | iso: 2026-05-28T20:26:40.000Z
model-visible : [{"type":"text","text":"now: 2026-05-28T20:26:40.000Z (1780000000000 ms)"}]
```

**clock-tool.ts 一行未改**，返回值精确变成注入的固定时刻——这就是
`dsh-fs-sandbox` 替换 `dsh-fs-local` 仍藏在 `ctx.fs` 背后（examples/acp-agent/cordis.yml 实况）
的机制微缩。对应 acp 示例的注释原话：*"dsh-fs-sandbox replaces dsh-fs-local behind ctx.fs"*。

## 契约测试

```sh
cd 仓库根 && ./node_modules/.bin/vitest run --config docs/zj/clock-seam-demo/vitest.config.ts
```

4 条契约（clock.spec.ts）：任意 provider 下 consumer 都注册 `clock_now`；system provider 返回
now 邻域；换 provider 结果随之变（精确回放 fixedAt）；FakeClock 的 `advance()` 支持确定性测试。

## 关键认知

1. **Service 类插件无 apply**：`export default class SystemClock extends ClockService`，
   构造器里 `super(ctx, 'clock')` → `ctx.reflect.provide(name, self)`，fiber 卸载自动注销。
2. **访问服务必须声明 inject**：未声明时访问 `ctx.clock` 直接抛
   `cannot get property "clock" without inject`（本 demo 调试时亲身踩中）——这是 cordis 的
   依赖保护，不是可选风格。
3. **Definition 不进 yml**：它只被 provider import（继承）与 consumer import（类型），
   装载它是无操作。dsh-fs 同理：file-summary-demo 的 yml 里就没有 `@deepseek-ai/dsh-fs`。
4. **inject 是硬依赖与等待语义**：`ToolRuntime` 的 `static inject = ['systemPrompt']`——
   不装 system-prompt，tools 服务保持 PENDING，`ctx.tools` 为 undefined（本 demo 调试实证）。
