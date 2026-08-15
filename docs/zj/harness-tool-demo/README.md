# harness-tool-demo — 第一个真实 dsh 扩展（07 课桥接）

路线图节点 **1-3-1**（07-into-the-harness）的桥接产出：把 1-3 学到的 Cordis 心智模型，
用到 harness 真世界的 `tools` 服务上。全程**无需密钥、不调模型**。

## 运行

```sh
cd docs/zj/harness-tool-demo && node --import tsx ../../../vendor/cordis/bin.js
```

## 实际输出

```
[tool-logger] greet -> Hello, Cordis!
tool replied: [{"type":"text","text":"Hello, Cordis!"}]
```

logger **先**触发——`tools/result` 在结果物化过程中发出，发生在 `execute` 向调用方返回的
promise 兑现之前。

## 文件

| 文件 | 角色 |
|---|---|
| `greet-tool.ts` | 工具提供方：`ctx.tools.register(defineTool(...))` + 代码模拟模型驱动一次真实调用 |
| `tool-logger.ts` | 观察者：`ctx.on('tools/result', ...)` 监听每次工具调用（与提供方互不知晓） |
| `cordis.yml` | 组合：system-prompt（工具 schema 贡献给系统提示词）+ tools + logger + greet-tool |

## 关键认知

1. **defineTool 双面性**：`parameters` 规约 → 模型可见的 JSON Schema；`execute` 前校验模型参数；`output.schema` 声明规范值；`output.render` 生成可持久化结果。
2. **注册即 effect**：`ctx.tools.register` 的 disposer 附着到插件，卸载时自动注销工具——与第 2 课 `ctx.on` 同一条律。
3. **依赖驱动加载**：`inject: ['tools']` 让工具插件等待注册表就绪；`dsh-tools` 又注入 `systemPrompt` 服务，所以组合里必须列出 `dsh-system-prompt`，否则工具插件永远 PENDING（06 课诊断）。
4. **解耦广播**：提供方与观察者互相不知道对方存在，由 `ctx.tools` 服务和 `tools/result` 事件连接。
5. **Capability seam 实证**：模型（此处用代码模拟）只面对 `tools` 服务——把 `tools` 的 provider 换成远程沙箱实现，整个工具执行世界跟着换，消费方无需改动。

## 从这里走向完整 agent

真实 agent = 本组合 + LLM 适配器 + agent loop + 持久化 + 运行入口。
对照 `examples/headless-agent/cordis.yml`，现在每个配置项都已可读。

## 关联

- 教程：`docs/cordis-tutorial/07-into-the-harness.md`
- 工具开发：`docs/user/develop/basic/tool.md`；三层能力设计：`docs/user/develop/practice/index.md`
- 全景文档：`docs/zj/architecture_panorama.md` → L3「Capability seam」章节
- 前置：`docs/zj/plugin-philosophy-demo/`（1-2-3）、`docs/zj/events-effects-demo/`（1-3-2）、`docs/zj/config-service-demo/`（1-3-3）
