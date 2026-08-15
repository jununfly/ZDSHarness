# config-service-demo — 服务与配置机制实证

路线图节点 **1-3-3**（理解服务与配置机制）的可运行实证。

## 文件

| 文件 | 角色 |
|---|---|
| `schema.ts` | 最小 Standard Schema V1 验证器（零依赖手写：string/array/object 组合，支持默认值） |
| `greeter-provider.ts` | 服务提供方：`Service` 子类 + `super(ctx,'greeter')` + 声明合并 |
| `consumer.ts` | 消费方：`inject: ['greeter']` + 导出同名 `Config` 接口与 `Config` schema |
| `cordis.yml` | 正常组合（targets 显式配置，greeting 走默认值） |
| `invalid/cordis.yml` | 无效配置演示（targets 传字符串） |

## 运行

正常配置（默认值补齐 + 服务消费）：

```sh
cd docs/zj/config-service-demo && node --import tsx ../../../vendor/cordis/bin.js
```

```
[consumer] resolved config: greeting=Hello, targets=[alpha, beta]
  Hello, alpha! (greeted 1 times)
  Hello, beta! (greeted 2 times)
```

无效配置（schema 验证失败 → 插件绝不启动）：

```sh
cd docs/zj/config-service-demo/invalid && node --import tsx ../../../../vendor/cordis/bin.js
```

```
Error: failed to apply loader entry ... (../consumer.ts): invalid config:
  - expected array but got "not-an-array" (at targets)
[ValidationError 由 vendor/cordis/src/fiber.ts resolveConfig 抛出 → fiber FAILED → 退出码 1]
```

## 机制要点

1. **Config 双身份**：`interface Config`（TS 类型，给消费方）与 `export const Config`（运行时 schema，给 Cordis）同名导出。必须实现 [Standard Schema V1](https://standardschema.dev/) 接口（`Config['~standard'].validate`）——schemastery 是正式实现，本 demo 手写最小版证明它只是"一个普通接口"。
2. **验证发生在 apply 之前**（`Fiber._resolveConfig` → `resolveConfig`）：失败即 `ValidationError`，fiber 进入 FAILED，插件不会带着半截配置启动。
3. **默认值归一化**：`apply(ctx, config)` 收到的一定是完整配置——`greeting` 未配置时被补齐为 `'Hello'`（schema 的 default 在 validate 阶段处理）。
4. **inject 是硬性依赖**：移除 `greeter-provider.ts` 后 consumer 保持 PENDING（合法状态，静默等待，不崩溃）。
5. **服务注册是 effect**：提供方卸载 → 服务消失 → 依赖方随之卸载 → 服务恢复后自动重载。这就是"配置中可以替换服务提供方"的机制基础。

## 关联

- 教程：`docs/cordis-tutorial/03-services.md`、`05-config.md`
- 全景文档：`docs/zj/architecture_panorama.md` → L3「插件形态与注册原语」
- 上一步：`docs/zj/events-effects-demo/`（1-3-2：事件分发模式与 effect 生命周期）
