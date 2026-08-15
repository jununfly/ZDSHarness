# file-summary-demo — 自创工具走 ctx.fs seam（1-5-1）

路线图节点 **1-5-1**（按 cookbook 加一个 tool）的产出：不抄 cookbook 的 `read_file` 示例，
自创一个 `file_summary` 工具，把 1-4-2 精读的 **观察-守卫闭环** 亲手用一遍。
全程**无需密钥、不调模型**（代码模拟模型驱动真实执行管线，与 harness-tool-demo 同款）。

## 运行

```sh
cd docs/zj/file-summary-demo && node --import tsx ../../../vendor/cordis/bin.js
```

## 实际输出

```
[observed] present D:\...\sample.txt @ 3466611665:1688849860712489:358:1786813441634709000:1786813441634709000 (tool exec)
isError        : false
model-visible  : [{"type":"text","text":"D:\\...\\sample.txt (version 3466611665:...): 8 lines; first 3:\n1: 第 1 行：观察-守卫闭环的最小切片\n2: ..."}]
```

## 契约测试

```sh
cd 仓库根 && ./node_modules/.bin/vitest run --config docs/zj/file-summary-demo/vitest.config.ts
```

3 条契约（file-summary.spec.ts）：happy path（输出形态 + `fs/observed` 记账一次且带 FsVersion）、
absent 失败路径（isError）、`schemas()` 白名单投影（只露 name/description/parameters）。

## 文件

| 文件 | 角色 |
|---|---|
| `file-summary-tool.ts` | 工具提供方：`inject: ['tools','fs']` + `ctx.tools.register(defineTool(...))`；只注册，测试可直接装载 |
| `observation-logger.ts` | 观察者：`ctx.on('fs/observed', ...)` 同步记账（fs-observation-policy 的最小替身） |
| `demo.ts` | 驱动器：`ctx.tools.execute(...)` 模拟模型调一次，走完整五阶段管线 |
| `cordis.yml` | 组合：system-prompt + tools + fs-local（提供 `ctx.fs`）+ 三个本地插件 |
| `sample.txt` | 8 行样例输入 |
| `vitest.config.ts` | 目录级测试配置（根配置只收 packages/tests；paths 插件同根配置款） |

## 关键认知（1-4-2 知识的实证）

1. **fs-local 是 Service 类插件**：`FileSystem extends Service`，`super(ctx, 'fs')`；
   yml 里 `@deepseek-ai/dsh-fs-local` 装载后自注册为 `ctx.fs`——没有 apply 函数。
2. **观察-守卫闭环的两半在同一次调用里**：`stat` 拿 `FsVersion`（version 形如
   `ino:size:mtime:ctime:birthtime` 复合），`ctx.emit('fs/observed', target, {kind:'present',version}, exec)`
   同步记账；若有 fs-observation-policy 监听，这个 version 就是后续 write/edit 的 stale 守卫。
3. **cookbook 契约全部兑现**：参数在 execute 前校验（`max_lines` 类型错误进不了工具体）；
   `output.schema` 声明规范值、`output.render` 投影模型可见文本；异常 → `isError`；
   `exec.signal` 全程传递。
4. **schemas() 白名单**：注册表只物化 `name/description/parameters` 三个模型可见字段——
   execute/render 实现成员不外泄（1-4-1 tools 笔记的 `schemas()` 契约实证）。
