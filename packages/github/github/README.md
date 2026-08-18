# @deepseek-ai/dsh-github

English | [中文](README.zh.md)

`GitHubRuntime` owns the `ctx.github` Service Definition for structured repository search, detail reads, and commit-pinned source reads. Providers register by stable id; calls require exactly one available provider and never select by registration order.

## Service API

`searchRepositories({ query, limit }, signal?)` returns repositories ordered by provider star rank, an ISO observation time, and truncation state. `readRepository({ owner, name }, signal?)` returns repository facts plus README text or `{ kind: "missing" }`. The runtime caps over-returned search results to `limit`.

Canonical research calls `resolveRevision()` before `listTree()` or `readFiles()`. `readFiles()` accepts one immutable revision, explicit paths, and a complete-result byte limit. Providers that do not implement these optional operations fail with capability-specific `GITHUB_*_UNSUPPORTED` codes instead of falling back to branch-relative reads.

Provider registration is effect-scoped and rejects duplicate ids. No provider raises `GITHUB_PROVIDER_UNAVAILABLE`; multiple available providers raise `GITHUB_PROVIDER_AMBIGUOUS`.

## Model Experience

Indirectly, through [`dsh-tool-github`](../tool-github/README.md), which projects structured repository facts into model-visible canonical JSON while this registry contributes no prompt or schema.

#### KV Cache effect

No direct invalidation; the named Consumer owns request-prefix changes.

## Known Limitations and Deferred Work

- Commit-pinned reads cover repository trees and UTF-8 files; issues, releases, pull requests, and binary files remain outside the capability.
- Provider selection supports one available provider per composition; explicit provider-id routing is deferred until a second production provider exists.
