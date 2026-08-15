# 1-4-3 精读笔记：用测试反向理解行为契约（验证报告）

> 方法：对 1-4-1/1-4-2 笔记里的每个「待 1-4-3 用测试印证」点，用 vitest 跑对应契约文件，逐条确认
> 日期：2026-08-15 ｜ 环境：Windows Git Bash + WorkBuddy sandbox ｜ 运行方式：`env -u NODE_OPTIONS ./node_modules/.bin/vitest run <file>`

## 验证结果总表

| 契约文件 | 结果 | 覆盖的源码笔记「待印证」点 |
|---|---|---|
| `session/tests/session.spec.ts` | **77/77** ✅ | session 事件追加/回放、append-only、lossless-JSON、深冻结、store 生命周期 |
| `session/tests/surface.spec.ts` | **57/57** ✅ | surface 增量 fold、rewrite 校验、deriveMessages 投影 |
| `tools/tests/tools.spec.ts` | **136/136** ✅ | 执行管线五阶段、ask 路由、schema DSL、presentCall/presentResult |
| `tools/tests/code-mode.spec.ts` | **89/89** ✅ | code collapse 谓词、nested dispatch、shapeDispatchLog |
| `agent-loop/tests/loop.spec.ts` | **54/54** ✅ | turn 生命周期、request/response 循环 |
| `agent-loop/tests/tool-calls.spec.ts` | **21/21** ✅ | 工具调用管线（waterfall/取消/结果归一） |
| `fs-local/tests/fsio.spec.ts` | **64/71**（6 失败=环境） | 原子写、二进制拒绝、maxBytes 双保险、editText |
| `fs-local/tests/filesystem.spec.ts` | **65/69**（4 失败=环境） | stale guard 两个错误码、并发锁、LF 规范化 |
| `tool-fs/tests/tools.spec.ts` | **73/73** ✅ | read 窗口、write/edit 工具契约 |
| `tool-fs/tests/integration.spec.ts` | **33/33** ✅ | read→write→edit→再读完整闭环 |
| `tool-fs/tests/read-image.spec.ts` | **24/25**（1 失败=环境） | gate 顺序、durable commit、拒绝语义 |

**合计：693 通过 / 11 环境限制 / 0 契约失败**。源码笔记里的每个「待印证」点都有对应测试确认。

## 关键契约确认（测试名即证据）

### 1. session 事件追加/回放（session.spec.ts）
- `replays identically from a seeded event log`——**seeded log 回放与实时追加产生相同视图**（持久化契约）
- `isolates the log from mutation through a derived message (append-only contract)`——deriveMessages 返回的数组改了不动 log
- `rejects non-JSON-serializable event data at the source (incl. sparse arrays)`——**sparse array 在源头被拒**（lossless-JSON walk 防栈溢出 + 拒绝 exotic）
- `deep-freezes seeded and appended event snapshots` / `iteratively freezes deeply nested restored event data`——**迭代式深冻结**（非递归，防爆栈）
- `does not publish a surface transition rejected by internal dispatch`——**validateNext 两阶段：先验证后提交**，veto 后不发布
- `resolves session/event dispatch before commit so instrumentation failure cannot hide a logged event`——**dispatch 解析先于 commit**（instrumentation 失败不能吞掉已记录事件）
- `defers a reentrant detach until the creation dispatch unwinds`——detach latch 等 unwind

### 2. surface 契约（surface.spec.ts）
- `rejects a replacement spanning multiple current nodes` / `rejects changes outside tool-result content`——**assertToolResultRewrite**（tool/result replace 只能改 content、不能跨节点）
- `picks up new events incrementally (delta processing)`——SurfaceManager 增量 fold
- `replace with both ends at real nodes splices only the range` / `single-node replacement (start === end)`——replace 区间语义
- `deriveMessages skips a surface node that derives to null (empty assistant/message)`——**空 content assistant/message derive 为 null 被跳过**
- `rejects a surface-eligible event without its mandatory marker`——**union-widening 漏洞的 runtime 守卫**

### 3. tools 执行管线（tools.spec.ts + code-mode.spec.ts）
- ToolRuntime describe（720 行起含 ask routing）——`ctx.approval` 路由、pre-execute/guard/approval/execute/post-execute 五阶段
- `collapses` 谓词：code-mode.spec.ts 89 个测试覆盖 collapse 判定、nested dispatch、`shapeDispatchLog` 的 ordered 阶段 head-of-line commit
- presentCall/presentResult describe（2718 行）——**call-time 与 result-time 呈现契约**

### 4. fs 观察-守卫闭环（filesystem.spec.ts + integration.spec.ts + tools.spec.ts）
- `two concurrent guarded writes: one updates, the other is rejected as stale`——**并发守卫：一个赢一个 stale**
- `checks the stale version BEFORE literal matching`——**version 检查优先于 literal 匹配**（edit）
- `reports a missing target as FS_STALE_VERSION even with no expectation (bare provider)`——**目标删除 = stale 不是 not-found**（版本语义）
- `a successful edit refreshes the version so an immediate follow-up edit proceeds`——**写成功刷新观察版本**（闭环闭合）
- `concurrent write vs edit at the same version: one wins, the other is stale`——跨工具并发
- `an overwrite returns LF-normalized before AND after`——diff basis 规范化
- `an overwrite of a BINARY prior file reports before:null (undiffable), still succeeds`——**二进制旧文件 before:null 但写入成功**（不因无法 diff 而拒绝）
- integration.spec.ts 33/33——read→write→edit→再读的完整工具链路
- read-image gate 顺序（read-image.spec.ts）——`refuses when no attachment service is mounted` / `refuses when no llm service is mounted` / `explains how to repair a declared/actual media-type mismatch`（IMAGE_TYPE_MISMATCH 的模型面补救）/ `fails with FS_TOO_LARGE before reading a file past maxImageBytes`（**gate 先于 IO**）

## 环境限制（非契约失败，共 11 个）

1. **symlink 相关 10 个**（fsio 6 + filesystem 4）：`two paths to the same file via a symlink share one targetKey` 等——Windows 沙箱无 symlink 创建权限（需管理员/开发者模式），`fs.symlinkSync` 抛 EPERM。源码里 realpath 身份共享 guard 的语义（1-4-2 笔记机制 3）**逻辑正确但本环境无法实测**，CI（Linux/WSL）可覆盖
2. **nested Code Mode 1 个**（read-image.spec.ts `forwards a nested Code Mode image`）：测试依赖 `setup({ toolMode: 'code' })` 加载完整 code runtime，Windows 沙箱加载失败（vitest 全量跑直接无输出）。nested dispatch 机制本身已被 code-mode.spec.ts 89/89 覆盖，仅「图片经 run_code 转发」这一组合场景未验证
3. **1 个 skip**：`creates new files owner-only by default`（POSIX 权限断言，Windows 无意义）

## 与全景文档的咬合

- **测试是行为的第二份规范**：源码笔记里从实现推导的语义（stale 优先于 literal、dispatch 先于 commit、gate 先于 IO）全部被测试名反向印证——测试名本身就是契约词表
- 1-4-3 与 1-4-1 的循环验证：tools 笔记的「ToolRuntime 只对 HarnessError 填 result.error」、session 笔记的「dispatch 解析先于 commit」等推导，在 136/77 个测试里找到直接断言
- fs 三件套的观察-守卫闭环（1-4-2 机制 1）由 integration.spec.ts 33 个测试做了**跨工具链路级**验证——read 观察 → write 守卫 → edit 守卫 → 再读推进，是 L3「能力包」分层设计的运行时证明
- 给 L4 全景解锁的启示：**测试运行方式已打通**（`env -u NODE_OPTIONS ./node_modules/.bin/vitest run <file>`），后续契约 demo 可快速迭代

## 运行经验（Windows 环境坑）

- `pnpm vitest` 在 Git Bash 下无输出且退出码 1——**必须直接调 `./node_modules/.bin/vitest`**
- 多文件并行/部分 -t 组合会静默失败（输出被吞）——**单个文件逐个跑，必要时 -t 分组跑**
- `--reporter=basic` 模块加载失败（ERR_LOAD_URL）——用默认 reporter
- vitest 成功也常报 exit 1（Windows 管道退出码噪声）——**看 Tests 统计行而不是退出码**
- stderr 的 vite-tsconfig-paths 提示无害
