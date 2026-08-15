# 1-4-1 精读笔记：`@deepseek-ai/dsh-scope`

> 包路径 `packages/core/scope/` ｜ 源码 `src/`（4 文件，561 行）｜ 测试 `tests/`（3 文件）
> 精读日期：2026-08-15 ｜ 定位：**scoped-context 原语**——为 Cordis context 打不透明身份标签，注册继承向下、事件路由向上

## 一句话定位

一个 `ScopeKey`（opaque object）+ 一个 parent 关系（WeakMap）驱动**两个方向**：注册视图继承**向下**（child scope 看到 ancestors 的 layers，`ScopedLayers`），事件准入延伸**向上**（ancestor listener 收到 descendant 的 dispatch，`scopeTarget`）。这是所有 core 包 scope-filtered 分发与 per-agent 注册的共享底座——agent/preset 父子、tools 的 scoped 注册/restrict/guard、system-prompt 的 section 遮蔽、session store 的 carrier 都建在它上面。

## 公开面

- **mint**：`createScope(ctx, key, options?)` → `Scope { ctx, rawDispose, dispose }`
- **身份**：`scopeOf(ctx)`（读 context 最近 scope tag）/ `bindScopeParent(key, parent)`（单次绑定，返回 `ScopeParentBinding`）/ `scopeParentOf(key)` / `scopeChainOf(key)`（nearest-first）
- **路由**：`scopeTarget(base, key)` → `Scoped<T>` carrier / `isScopeCarrier(value)` / `carrierKeyOf(value)`
- **存储**（store.ts）：`ScopedLayers<L>` / `NamedEntries<V>` / `AnonymousEntries<V>` / `ScopeLayer`（`isEmpty()`）
- **类型**：`ScopeKey = object`、`Scoped<T>`（branded，carrier 不暴露 subject 属性）

## 核心机制（源码证据）

1. **scopeTarget 的准入 filter**（`index.ts:170`）：base 既有 filter 先判（保留 service 原过滤语义），然后 untagged listener **全局准入**，tagged listener 只匹配 dispatch key 或沿 parent 链向上匹配——**tag 低于 dispatch key 的一律排除**（事件沿链上行，绝不下行）。这正是"一个 standing 组合能观察它组合下的每个 agent"的机制。
2. **单次绑定 + rebind**（`index.ts:54`）：`bindScopeParent` 对已有 parent 的 key 抛错——ancestry 只有原始 binder 能移；`rebind` 是唯一重链通道（blank-session recompose 契约：旧 parent 下产出的东西不得被保留，因为 parent 关系看不见 session 日志了什么）；`linkScopeParent` 做 cycle check（每个链消费者都走到 root）。
3. **createScope 的 ownership**（`index.ts:137`）：`fiber.ctx.extend({[kScope]: key})`——scoped context 继承 minting 插件的依赖 API，**owns 一切经它注册的东西**；`rawDispose` 是精确 Cordis disposer（供复合 effect 按序嵌套），`dispose` 用 `disposing ??=` 保证 racing 调用等**同一** quiescence，`quiesceFiber` 跟随 fiber 的 inertia 走完异步 teardown。
4. **ScopedLayers**（`store.ts:159`）：global layer 急切构造；scoped layer 惰性。**reads 永不创建 layer**（`peek` 故意 chain-blind——"自己的贡献"不得被 ancestor 冒名；`chainLayers` 才讲继承，farthest first / exact last）；`merge` 用于 named 表遮蔽。`effect` 把一次同步 layer 变更挂到注册 context：创建 → action（抛错且新层全空则回收）→ yield undo → **完全空才 delete layer**；notify 在注册后与注销后都发（`onChange` 即各 registry 的 `tools/change` / `system-prompt/change`）。
5. **条目表语义**（`store.ts:30`）：`NamedEntries` 插入序、duplicate 诊断由**调用者**注入（每个 registry 给不同报错文案）；`AnonymousEntries` 用 Symbol key 保证相等值仍是独立注册。**iterators live within one nonempty table generation**——表 drain 后换新 Map，旧迭代器与新插入 detach（防活迭代器污染）。

## 与全景文档的咬合

- 对应 L3「scope 机制」：agent 身份即 ScopeKey；preset/agent 父子 = `bindScopeParent`（agent 包 createScope 时 parent）
- 所有 scope-filtered 事件（agent/*、tools/*、system-prompt/assemble、session/created、request-header 等）的 carrier 都由 `scopeTarget(this, agent)` 构建
- `ScopedLayers` 是 tools（ToolLayer）、system-prompt（PromptLayer）注册的共享底座；tools 的 `view()` 可见性解析 = `chainLayers` + `merge` + own layer 豁免
- 1-4-1 前六包笔记里的 "scoped 遮蔽全局 / ancestor listener 收 descendant 事件 / nearest wins" 全部能回落到本包的两条原语

## 待 1-4-3 用测试印证

- `tests/` 3 个文件：`scope.spec.ts`（222 行，路由上行/下行边界）、`store.spec.ts`（289 行，layer 回收/迭代器 detach）、`invariant.spec.ts`
- 验证点：descendant dispatch 被 ancestor listener 接收、tag 低于 dispatch key 的排除、`disposing ??=` 的 racing 等同一 quiescence
