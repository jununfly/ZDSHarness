# github/ — GitHub repository capability family

English | [中文](README.zh.md)

This family provides structured github.com repository discovery and reading.

| Package | Role | Registration |
|---|---|---|
| [`github/`](github/README.md) | Service Definition and provider registry | `ctx.github` |
| [`github-rest/`](github-rest/README.md) | github.com REST provider | registers on `ctx.github` |
| [`tool-github/`](tool-github/README.md) | Model-facing search and repository-read Consumer | registers on `ctx.tools` |

The public request, result, provider, and error vocabulary is documented in [GitHub Repository Access](../../docs/subsystems/github.md).
