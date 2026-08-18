# github/ — GitHub 仓库能力系列

[English](README.md) | 中文

本系列提供结构化的 github.com 仓库发现与读取能力。

| 包 | 角色 | 注册位置 |
|---|---|---|
| [`github/`](github/README.md) | Service Definition 与提供方注册表 | `ctx.github` |
| [`github-rest/`](github-rest/README.md) | github.com REST 提供方 | 注册到 `ctx.github` |
| [`tool-github/`](tool-github/README.md) | 面向模型的搜索与仓库读取 Consumer | 注册到 `ctx.tools` |

公共请求、结果、提供方与错误术语见 [GitHub 仓库访问](../../docs/subsystems/github.md)。
