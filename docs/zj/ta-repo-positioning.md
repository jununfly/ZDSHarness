---
doc-kind: architecture-cross-cutting
authority: primary
authority-id: architecture.cross-cutting.repo-positioning
---

# 仓库定位（三项铁律）

## Question

ZDSHarness 这个 fork 在本项目生态里扮演什么角色？其它项目应如何消费它、本仓允许什么改动？

## Scope

本页是 ZDSHarness 仓库的**定位与治理铁律**，属于跨切规则：任何改动本仓、或本仓被外部项目引用时都必须遵守。覆盖三件事：

- 本仓与上游 dsh 的关系（只同步稳定版）
- 本仓允许的改动类型（只修 dsh 自身 bug）
- 外部项目对本仓的引用方式（消费构建产物，不直接改）

## Boundaries

不在本页范围：

- dsh 内部各子系统 / 插件的具体架构 —— 见上游 `../../docs/architecture.md` 及各 subsystem 页
- 在 dsh 上构建的新产品 / 新能力 —— 属消费方仓库（ZAgentic、ZWorkbench 等），不属本仓
- 学习性 roadmap 的内容细节 —— 见 `../learning_roadmap.json`（其「学习」部分在铁律 2 下仍有效）

## 三项铁律

### 铁律 1 — 只定期 merge from dsh 稳定版本

- **[target architecture]** ZDSHarness 是 dsh 稳定基线的 **tracking fork**：上游镜像 + 同步点，不长期偏离稳定基线。
- **[implemented behavior]** 本地 `master` 已对齐 `dsh-v0.1.5-rc.2`（`18adff61` 单 commit 重置基线 → `43e089b8` 合并 PR #1）。
- **[implication]** 不自由 rename / repackage（上游 pre-release 姿态在首个 tag 后删除，与此一致）；同步走 merge，不 cherry-pick 制造分叉。

### 铁律 2 — 只修使用过程中 dsh 自身的 bug

- **[target architecture]** 允许在本仓打 bugfix，但范围限定为「dsh 代码缺陷修复」。
- **[implemented behavior]** bugfix 走独立 fix commit / 分支；**绝不 amend 已推历史**（追加 fix，保持可核对）。
- **[inference]** 不含新功能、新能力、新产品的开发 —— 那属于消费方仓库，不在本仓做。

### 铁律 3 — 其他项目引用其构建产物，不直接改本仓

- **[target architecture]** 本仓是「被消费的依赖 / 库」，不是开发 workspace。
- **[implemented behavior]** 消费方（ZAgentic / ZWorkbench / 新产品）通过**构建产物**（lib / 发布包）引用；任何基于 dsh 的新开发发生在消费方仓库，不落本仓。
- **[example]** `zworkbench-bootstrap` 已从本仓抽到 ZWorkbench 仓库（外部产品胶水，不当本仓负担），是本铁律的实例。

## Source map

- `../../AGENTS.md` — pre-release stance：「Remove this section at the first tagged release」（与铁律 1 一致：不长期偏离基线）
- `../../README.md` — 上游 dsh，tracking 来源
- `../learning_roadmap.json` — 学习性 roadmap（铁律 2 下仍有效：理解 dsh 才能修 bug）
- `../../.workbuddy/memory/MEMORY.md` — 本决策的长期记录（2026-09-19 由 zj 确立，最高优先级）

## Related authority

- dsh 上游跨切规则（见 `../../docs/architecture.md`）—— 本页是其 fork 层定位补充，不重复拥有上游规则
- 消费方仓库定位（ZAgentic / ZWorkbench）—— 属各自仓库，本页不拥有
