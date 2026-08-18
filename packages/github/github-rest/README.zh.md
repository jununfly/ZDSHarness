# @deepseek-ai/dsh-github-rest

[English](README.md) | 中文

本函数插件在 [`ctx.github`](../github/README.md) 注册 github.com REST 提供方。它通过 Octokit 执行按 star 排序的仓库搜索、读取仓库元数据、解析默认分支 revision、读取递归 commit tree 并执行有界 base64 文件解码。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `tokenEnv` | `GITHUB_TOKEN` | 每次操作前解析的凭据引用。缺少凭据时使用 GitHub 匿名额度。 |
| `timeoutMs` | `10000` | 独立应用于每个 REST 请求的正整数超时。 |

可选凭据通过 `ctx.credentials` 解析；没有该服务时从启动环境解析。值不会缓存，也不会进入诊断。

## 失败

额度耗尽抛出含重置时间的 `GITHUB_RATE_LIMITED`。凭据被拒绝、仓库不存在、调用方取消、提供方超时和 5xx 响应分别抛出 `GITHUB_AUTHENTICATION_FAILED`、`GITHUB_REPOSITORY_NOT_FOUND`、`GITHUB_REQUEST_CANCELLED`、`GITHUB_REQUEST_TIMEOUT` 和 `GITHUB_UPSTREAM_FAILED`。缺少 README 是成功的 `{ kind: "missing" }` 结果。

递归目录树被截断时抛出 `GITHUB_TREE_TRUNCATED`。非文本路径抛出 `GITHUB_FILE_NOT_TEXT`；解码后 batch 超过 `maxBytes` 时抛出 `GITHUB_FILES_TOO_LARGE`，且不会返回部分 batch。

## 模型体验

Indirectly, through [`dsh-tool-github`](../tool-github/README.md)，后者保留该提供方的有界仓库事实与失败，同时隐藏传输机制和凭据。

#### KV Cache 影响

不直接使缓存失效；具名 Consumer 负责请求前缀变更。

## 已知限制与延期工作

- 只支持 github.com；GitHub Enterprise Server base URL 不可配置。
- GitHub 递归 tree 响应存在上游大小限制；由于 Git tree 没有无损递归 continuation token，提供方会拒绝截断响应而不是分页。
