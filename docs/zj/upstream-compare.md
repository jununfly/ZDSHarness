# upstream 对比：ZHarness vs deepseek-ai/deepseek-harness（1-5-3）

> 生成：2026-08-16 01:35 · 方法：shallow fetch 快照对比（本地为单提交 squash 导入，与 upstream **无共享历史**，merge-base 不存在）

## TL;DR

| 问题 | 答案 |
|---|---|
| fork 落后 upstream 多少？ | **零**。upstream HEAD（`47f9438`，2026-08-13 19:38，PR #2519 npm-public）早于本 fork 的导入提交（2026-08-15 10:28）。导入后 upstream 无新提交 |
| fork 改了什么？ | 仅两类：导入时的 fork 声明（README/LICENSE 等）+ 全部学习产出（`docs/zj/**`，33 文件 +3570 行） |
| `packages/` 源码有漂移吗？ | **零漂移**。整树 diff 中 `packages/` 下只有 1 个文件不同：`packages/CLAUDE.md`（type change，agent 文档重组，非代码） |
| 同步策略？ | 无需同步。若未来 upstream 演进：无共享历史 → 不能 rebase；用「重新 squash 导入 + `docs/zj` 移植」或 `git merge -s ours upstream/master` 建立伪共同祖先 |

## 方法论（含环境故障记录）

1. **squash 导入判定**：`git log --reverse` 首提交 `b0ae838 "Initial import..."`，全史仅 12 commits → 与 upstream 无 merge-base。
   全量 fetch 需下载 28.4 万对象（GIT_TRACE 实测 pack_header=2,284496），故改 `git fetch --depth 1 upstream master` 快照对比。
2. **网络**：`https://github.com` 走本地代理 127.0.0.1 已失效（fetch 直接失败）；改 SSH URL `git@github.com:deepseek-ai/deepseek-harness.git`（与 origin 同通道）成功。
3. **症状 E 复发**：fetch 成功后 `refs/remotes/upstream/master` 被 WorkBuddy 沙箱吞掉（FETCH_HEAD 有对象、loose ref 不存在）。
   修法照旧：单独命令手写 `.git/refs/remotes/upstream/master` = `47f9438...`，验证 `rev-parse` 通过。

## 快照 diff 全解（master ↔ upstream/master，52 files，+130/−3575）

### A. fork 声明与导入时调整（fork 侧改动的镜像，upstream 没变）

| 文件 | 变更 | 说明 |
|---|---|---|
| `README.md` / `README.zh.md` | M | fork 首行声明：downstream fork of deepseek-ai/deepseek-harness, maintained by jununfly |
| `LICENSE` | M | 原版权与许可条款保留声明（THIRD_PARTY_NOTICES） |
| `.gitignore` | M | fork 追加 `.workbuddy/` 排除（本地开发态） |
| `.gitlab-ci.yml` | A（upstream 有、fork 无） | 导入时未带 GitLab CI |
| `vendor/cordis/bin.js` | M | 导入时差异（vendor 校验脚本 `check-vendor-manifest.sh` 同步 M） |
| `scripts/*.sh` ×5 | M | 同上，导入边界差异 |
| `.agents/skills/.../encode_gif.py` | M | 同上 |

### B. upstream 侧的 agent 文档重组（T = type change，导入时即如此）

`.claude/skills`、`CLAUDE.md`（根 + examples/ + packages/ + vendor/ + .agents/notes/）、
`examples/acp-agent/tests/snapshots/.../AGENTS.md` ×2 —— upstream 把 agent 说明文档组织成了
`.claude/skills` 结构（symlink/目录形态），fork 导入保持了这份形态。

### C. fork 独有内容（D = upstream 无）

`docs/zj/**` 全部：architecture_panorama（md+html）、learning_roadmap（json+md）、
notes 10 篇、4 个可运行 demo（plugin-philosophy / events-effects / config-service / harness-tool）。
（本轮 1-5-1/1-5-2 的 file-summary-demo、clock-seam-demo 尚未 commit，未计入。）

## upstream 动向注记

- HEAD 提交：`Merge pull request #2519 from deepseek-harness/feat/npm-public`（2026-08-13）——
  upstream 正在推进 **npm 公开发布**（配合 README 里的 developer preview 定位）。
- 对 fork 的含义：后续 `@deepseek-ai/*` 包若发布到公共 npm，fork 可选择改用 registry 依赖而非 workspace 源码——
  但那会失去源码精读的就近性，建议保持 workspace 源。

## 后续同步操作手册（当 upstream 真的演进后）

```sh
# 1. 快照拉取（PS 通道；SSH URL；fetch 后手写恢复被吞的 loose ref）
git fetch --depth 1 upstream master
# 2. 快照对比（无共享历史的唯一正确姿势）
git diff --stat master upstream/master
git diff --name-status master upstream/master -- packages/
# 3. 若决定吸收：重新 squash 导入为新基线提交，docs/zj 与 .gitignore 调整以 cherry-pick/移植回放
```
