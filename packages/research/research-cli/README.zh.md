# @deepseek-ai/dsh-research-cli

[English](README.md) | 中文

`dsh-research` 从 stdin 读取一个 `zj-research-cli/v1` JSON request，并向 stdout 写入一个 versioned JSON response。`describe` 在不调用外部服务的情况下报告兼容操作，`collect` 运行 commit-pinned Evidence Compiler，`compile-report` 运行共享 Report Compiler，`render-html` 校验报告 family 的最终 Markdown 并派生离线 HTML，`evaluate` 根据同一 Report IR 与 sealed ledger 输出确定性健康结果。Diagnostics 写入 stderr 并使用非零退出状态；stdout 只承载机器数据。

可执行文件读取可选的 `GITHUB_TOKEN` 环境变量执行 canonical GitHub 调用。`DEEPWIKI_MCP_URL` 启用内部导航，`DSH_RESEARCH_EXTERNAL_NAVIGATION_REPOSITORIES` 提供以逗号分隔的精确 allowlist。Collect operation 把经过校验的 sealed ledger 持久化到 `$DSH_HOME/cache/research/v1` 或 `~/.dsh/cache/research/v1`；损坏 entry 会使调用失败。调用方必须拒绝其他 protocol version；CLI 不会静默降级到仅生成 Markdown。

## Model Experience

通过 skill 或 automation adapter 间接影响模型。该可执行文件不贡献模型 prompt 或 tool schema。

#### KV Cache effect

没有直接失效影响；模型可见文本由调用 adapter 负责。

## Known Limitations and Deferred Work

- Protocol 返回已编译 Markdown 与派生 HTML 但不写入 artifact；每个 host 保留自己的授权文件系统发布步骤。
