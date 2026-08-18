# @deepseek-ai/dsh-github-rest

English | [中文](README.zh.md)

This function plugin registers a github.com REST provider on [`ctx.github`](../github/README.md). It uses Octokit for star-sorted repository search, repository metadata, default-branch revision resolution, recursive commit trees, and bounded base64 file decoding.

## Config

| Key | Default | Meaning |
|---|---|---|
| `tokenEnv` | `GITHUB_TOKEN` | Credential reference resolved before every operation. Missing credentials use GitHub's anonymous quota. |
| `timeoutMs` | `10000` | Positive integer timeout applied independently to each REST request. |

The optional credential resolves through `ctx.credentials`; without that service it resolves through the launch environment. Values are never cached or included in diagnostics.

## Failures

Rate exhaustion raises `GITHUB_RATE_LIMITED` with the reset time. A rejected credential raises `GITHUB_AUTHENTICATION_FAILED`; a missing repository raises `GITHUB_REPOSITORY_NOT_FOUND`; caller cancellation and provider timeout raise `GITHUB_REQUEST_CANCELLED` and `GITHUB_REQUEST_TIMEOUT`; 5xx responses raise `GITHUB_UPSTREAM_FAILED`. A missing README is a successful `{ kind: "missing" }` result.

A truncated recursive tree raises `GITHUB_TREE_TRUNCATED`. A non-text path raises `GITHUB_FILE_NOT_TEXT`, and a decoded batch that exceeds `maxBytes` raises `GITHUB_FILES_TOO_LARGE` without returning a partial batch.

## Model Experience

Indirectly, through [`dsh-tool-github`](../tool-github/README.md), which retains this provider's bounded repository facts and failures while transport mechanics and credentials remain hidden.

#### KV Cache effect

No direct invalidation; the named Consumer owns request-prefix changes.

## Known Limitations and Deferred Work

- Only github.com is supported; GitHub Enterprise Server base URLs are not configurable.
- Recursive GitHub tree responses have an upstream size limit; the provider rejects truncation instead of paging because Git trees provide no lossless recursive continuation token.
