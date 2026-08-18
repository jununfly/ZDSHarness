# @deepseek-ai/dsh-github

[English](README.md) | 中文

`GitHubRuntime` 负责结构化仓库搜索、详情读取与 commit-pinned source read 的 `ctx.github` Service Definition。提供方以稳定 id 注册；调用要求恰好一个可用提供方，绝不按注册顺序选择。

## 服务 API

`searchRepositories({ query, limit }, signal?)` 返回按提供方 star 排序的仓库、ISO 观察时间和截断状态。`readRepository({ owner, name }, signal?)` 返回仓库事实及 README 文本或 `{ kind: "missing" }`。运行时会把超额搜索结果截断到 `limit`。

Canonical research 在 `listTree()` 或 `readFiles()` 前调用 `resolveRevision()`。`readFiles()` 接受一个不可变 revision、显式路径和完整结果字节上限。未实现这些可选操作的提供方会返回能力对应的 `GITHUB_*_UNSUPPORTED` 错误，不会降级为相对分支读取。

提供方注册随 effect 生命周期释放，重复 id 会失败。没有提供方时抛出 `GITHUB_PROVIDER_UNAVAILABLE`；存在多个可用提供方时抛出 `GITHUB_PROVIDER_AMBIGUOUS`。

## 模型体验

Indirectly, through [`dsh-tool-github`](../tool-github/README.md)，后者将结构化仓库事实投影为模型可见的规范 JSON；本注册表不提供提示词或 schema。

#### KV Cache 影响

不直接使缓存失效；具名 Consumer 负责请求前缀变更。

## 已知限制与延期工作

- Commit-pinned read 覆盖仓库目录树与 UTF-8 文件；issue、release、pull request 和二进制文件仍不在能力范围内。
- 每个组合只允许一个可用提供方；显式提供方 id 路由等到出现第二个生产提供方时再增加。
