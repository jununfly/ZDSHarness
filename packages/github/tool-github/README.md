# @deepseek-ai/dsh-tool-github

English | [中文](README.zh.md)

This Consumer exposes `github_search_repositories` and `github_read_repository` over [`ctx.github`](../github/README.md). Both tools return canonical JSON and forward cancellation to the provider.

## Config

| Key | Default | Meaning |
|---|---|---|
| `searchMaxResults` | `30` | Candidate cap from 1 through 30, enforced on every search. |
| `timeoutMs` | `30000` | Positive cooperative timeout attached to each tool. |

Search calls render as search-kind generic cards; repository reads use generic cards. Both are concurrency-safe reads. The prompt identifies github.com, descending-star recall, observation timestamps, follow-up reads, and repository URL citation.

## Model Experience

### GitHub guidance and tool schemas

#### What the model sees

Every request in this plugin's scope receives the github.com discovery and citation guidance. The model also sees the generated [`github_search_repositories` and `github_read_repository` schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tool-github): search accepts `query`, while read accepts `owner` and `name`.

#### Token effect

The prompt and two schemas add a fixed request-prefix cost while the plugin is active.

#### KV Cache effect

Prefix-stable while the plugin, prompt, visible tool definitions, and order remain unchanged; activation, disposal, or scoped restrictions may invalidate reuse from the first changed token.

### Repository results and errors

#### What the model sees

Canonical JSON preserves star counts, topics, license, language, update time, README availability, repository URL, observation time, and truncation without inventing absent optional facts. Search results remain bounded by `searchMaxResults`; provider and validation failures are returned as tool errors.

#### Token effect

Search results are bounded to 30 candidates; repository reads may retain README text until compaction.

#### KV Cache effect

Append-only; each result follows the reusable request prefix.

## Known Limitations and Deferred Work

- The tools expose GitHub facts, not topic-match scores; research policy owns scoring and evidence.
- Search controls other than the GitHub query string and deployment-owned result cap are not exposed.
