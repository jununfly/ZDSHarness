# 1-4-2 精读笔记：fs 能力包三件套（dsh-fs / dsh-fs-local / dsh-tool-fs）

> 包路径 `packages/fs/`（fs 503 行 + fs-local 1210 行 + tool-fs 1463 行 = 3176 行源码）｜ 测试 4517 行（fs 2 文件 + fs-local 3 文件 + tool-fs 8 文件）
> 精读日期：2026-08-15 ｜ 定位：**能力包完整分层的样板**——契约层（`dsh-fs`）定义抽象与语义，实现层（`dsh-fs-local`）提供本地落盘与守卫，模型面对接层（`dsh-tool-fs`）把能力注册成工具并挂 system-prompt

## 一句话定位

三个包是同一个能力「模型可读写的文件系统」的**三层切分**：`dsh-fs` 只谈**契约**（abstract `FileSystem` + branded `FsTargetKey`/`FsVersion` + 13 个错误码 + 意图/结果类型），`dsh-fs-local` 兑现**语义**（每-targetKey FIFO 锁、realpath 身份、staging 原子替换、版本守卫、二进制拒绝），`dsh-tool-fs` 做成**工具面**（read/write/edit/read_image 注册 + system-prompt 引导 + 观察-守卫闭环接线 + 与 bash 对齐的 sandbox 升级）。三层之间靠 **intent/guard 单槽（waterfall）+ `fs/observed` 事件 + replay-safe 呈现 meta** 三根线咬合，是 1-4-1 core 笔记里 waterfall 扩展点、tool/result meta、scope carrier 的第一个完整能力包实例。

## 公开面

### 契约层 `dsh-fs`（fs/src/index.ts + types.ts）
- **抽象**：`FileSystem` 类——`resolve/processPath/fileUrl/contains/stat/lstat/readText/streamText/readBytes/listDir/writeText/editText` 全部 abstract；`sandboxMode` getter 默认 `undefined`（**能力事实**：没 mount confining backend 就是裸实现）
- **身份**：`FsTargetKey` / `FsVersion` opaque branded（消费者禁用解析，必须来自 `resolve`/`stat` 的返回）
- **错误**：`FsError`（code + message + cause）+ 13 个 `FsErrorCode`（含 `FS_NOT_FOUND` / `FS_NOT_REGULAR_FILE` / `FS_NOT_TEXT` / `FS_STALE_VERSION` / `FS_NOT_OBSERVED` / `FS_SANDBOX_DENIED`）
- **意图/结果**：`FsWriteIntent`（createIfAbsent / replaceIfVersion）/ `FsWriteOutcome`（operation: create|update + before + after + version）/ `FsEditRequest`（oldString + newString + replaceAll）/ `FsEditOutcome`
- **事件声明**：`fs/write-intent`、`fs/edit-intent`、`fs/observed`（本包只管类型与语义，不 emit）

### 实现层 `dsh-fs-local`（fs-local/src/index.ts + fsio.ts + win32.ts）
- `LocalFileSystem extends FileSystem`：`withLock(key)` 每-targetKey FIFO 锁；`resolve` 走 `resolveLocalTarget`（realpath 派生身份）
- `writeText(target, content, intent, signal, sandboxPolicy)` / `editText`（stale guard 语义 + staging 原子替换）
- fsio：`readWholeBytes`（双保险 maxBytes）/ `streamWholeText`（NUL 采样二进制拒绝）/ `writeFileAtomic`（同目录 staging + POSIX 权限 + Windows DACL）
- win32：Koffi 懒加载 `GetFileSecurityW`/`SetFileSecurityW`/`ReplaceFileW`，错误码映射 ENOENT/EACCES/EIO

### 工具层 `dsh-tool-fs`（tool-fs/src/*，12 文件）
- 工具：`read`（一次 stat + 窗口化）/ `write`（无条件或意图化覆盖）/ `edit`（literal 唯一匹配或 replace_all）/ `read_image`（条件注册：仅 attachments 挂载时）
- 呈现：`presentCall`/`presentResult` diff 卡 + read 行窗口卡，全部 replay-safe（meta 恢复 + generic fallback）
- 沙箱：`FsSandboxController`（escalation 字段广告 / 每调用 policy 解析 / `[sandbox: …]` 拒绝标记）

## 核心机制（源码证据）

1. **观察-守卫闭环（本包的核心缝合线）**：读路径 `resolveRegularReadTarget`（read-target.ts:19）**一次 stat** 完成四件事——absence 观察（`info === undefined` → `ctx.emit('fs/observed', target, {kind:'absent'})` + `FS_NOT_FOUND`）、type 检查（非 file → `FS_NOT_REGULAR_FILE`）、size 路由（`< 10 MiB` 走 readText，否则 streamText）、present version 记录（`ctx.emit('fs/observed', …{kind:'present', version})`）。写路径（write.ts:111 / edit.ts:126）通过 `ctx.waterfall('fs/write-intent' | 'fs/edit-intent', target, exec, () => undefined)` 取**单槽决策**——policy 插件（fs-observation-policy）产出 `createIfAbsent`/`replaceIfVersion` 或直接抛 `FS_NOT_OBSERVED`；裸默认 `undefined` = **无条件原子覆盖**（不 stat，绝不自己制造 version basis）。改动成功后同样 emit `fs/observed` present。**观察者记忆 → 守卫者校验**，闭环闭合。
2. **版本守卫的两个错误码语义**（error.ts:14）：`FS_STALE_VERSION` = 目标存在但 version 不匹配（**文件变了**，含目标不存在）→ 补救文案「re-read the file, then retry」；`FS_NOT_OBSERVED` = 本 session **从未读过** 或 createIfAbsent 撞已存在 → 「read the file, then retry」。补救只加在模型边界（`remediateFsError` 保留 code + cause），provider 消息保持机器可读。fs-local 实现（index.ts）在 version 不匹配/不存在时抛 `FS_STALE_VERSION`，createIfAbsent 撞已有时抛 `FS_NOT_OBSERVED`。
3. **realpath 身份 + FIFO 锁**（fs-local index.ts）：`resolve` 经 realpath 派生身份——**别名/软链共享同一 targetKey**，所以 stale guards 跨别名一致；`withLock` 把 read→guard→write 窗口按 key 串行化，防同 key 并发覆盖交错。
4. **原子替换与二进制拒绝**（fsio.ts）：写入 = 同目录 staging 文件（`writeFileAtomic`：POSIX 0o700/0o600，Windows `copyFileDaclWin32` 拷旧文件 DACL + `PROTECTED_DACL` 防 staging 父目录继承，`replaceFileWin32` 保留替换元数据）→ rename/replace；`streamWholeText` 前 8192 字节采样含 NUL → `FS_NOT_TEXT`（前采样即拒绝，不做全量解码才报错）；`readWholeBytes` 双保险——stat 预检 + 流式累积超 `maxBytes` 即断。
5. **read 窗口的防爆与精确**（read-render.ts）：`buildWindow` 流式逐 chunk 扫换行，`lineBufferCap = maxLineLength + 1`（一行无换行巨行也无法撑爆内存，多 1 字符足够证明溢出）；`consumeLine` 同时维护 `totalLines`（**精确总行数**，即使窗口截断也扫完全程）与 `outputBytes`（字节上限，超限 `truncatedByBytes` 短路）；`finish` 对 `offset > totalLines` 抛 `FS_NOT_FOUND`（offset 越界是错误不是空窗）。`formatReadOutput` 产出 OpenCode 风格 `N: line` + footer（`(Showing lines a-b of N. Use offset=b+1 to continue.)` / `(End of file…)` / `(Output capped…)`）。
6. **replay-safe 呈现 meta**（diff.ts / read-render.ts:220）：write/edit/read 的 `presentResult` 都从 `result.meta`（opaque unknown，session append 校验 JSON-serializable）恢复结构化视图——`diffsFromMeta` / `readMetaFromMeta` 做**防御性 narrow + 语义校验**（read 还查 offset 1-based、行号严格递增、不超 totalLines），畸形即 fallback generic 卡，绝不 throw 于 replay。diff 卡本身 `computeHunkDiffs`（diff.ts:33）用 `structuredPatch` + 3 context 行，跳过 `\` no-newline 标记，纯插入 `oldText: null`。
7. **沙箱升级与 bash 完全同构**（sandbox.ts）：`FsSandboxController` 构造时以 `ctx.fs.sandboxMode` 为**能力事实**——confining 才 `escalationModes = ESCALATION_TARGETS` 并要求 `ctx.get('sandboxPolicy')`（缺失即抛错）；`schemaFields()` 只在 confining 时 spread 进 write/edit 的 parameters（**schema 层就拒绝**非 confining 下的升级参数）；`resolvePolicy` 顺序 = validateEscalationArgs → session standing mode → 有升级参数才 `approveEscalation`（严格更宽 + justification + user approval，同 `dsh-tool-bash` 词表）；`mapError` 把 `FS_SANDBOX_DENIED` 包成带 `[sandbox: …]` 标记 + escalation hint 的 `FsError`——**保留 code** 是因为 `ToolRuntime` 只对 `HarnessError` 实例填 `result.error`，plain Error 会剥掉重试/观察者键。
8. **read_image 的严格 gate 顺序**（read-image.ts）：扩展名 → mediaType 白名单 → attachments 服务存在 → `imageLimits.mediaTypes` 包含 → `assertImageCapableRoute`（requestHeader config → agent options 解析 provider/model → `llm.resolveModelInfo` → `inputModalities` 必须显式含 image）——**所有 gate 先于任何文件 IO**（拒绝不泄漏部分读取）；字节上限 `min(maxImageBytes, maxMessageImageBytes)`（每图 + 每消息双限）；`attachments.saveImage` **持久化先于返回**（tool/result 事件落盘时 attachment 必须已 durable）；`exec.parent !== undefined` 时 `deferContext` 注入 image block（嵌套调度也能带图）；`isConcurrencySafe: () => true`（内容寻址写幂等，同文件并发读无冲突）。gate 比 host 上传 preflight 更严：工具结果进 durable session history，路由带不动图会断延续，所以 unknown 能力直接 refuse 不靠 adapter 兜底。
9. **session cwd 语义**（session-cwd.ts）：`sessionCwd` = `exec.agent.session.header.cwd`（每 session 的 workspace，不是 server 启动目录，镜像 bash workdir 语义）；路径或 cwd 含 `..` 段时走 `canonicalPath`（parent 遍历让软链 cwd 的文件系统身份可观察）；`sessionResolveOptions` 优先级 = policyWorkspaceRoot（升级时 sandbox root）> session cwd，均缺则 leave 给 provider 默认（**工具边界不读 process.cwd()**）。
10. **工具引导与装配**（index.ts / write.ts:63 / edit.ts:77）：systemPrompt section `tool:read` order 100、`tool:write` 101、`tool:edit` 102（默认 fs-observation-policy 要求先读，写覆盖前要先读的提示写进 section）；`read_image` 在 `ctx.inject(['attachments'], …)` 内注册（无 durable store 即不存在此工具）；read_image 的 read 前缀说明 read 族共享路径解析。两个 invariant 包（fs-local/invariant.ts、tool-fs/invariant.ts）都是空 install——**无独立生命周期流**，执行关系归能力 seam（fs/tools/session）所有。

## 与全景文档的咬合

- 对应 L3「能力包」分层样例：**契约层 / 实现层 / 模型面对接层**三明治——`dsh-fs` 的 abstract 面即 L2 容器对外承诺，`dsh-fs-local` 是可替换的本地实现，`dsh-tool-fs` 把能力翻译成工具/提示词/呈现
- **waterfall 扩展点的能力包实例**：`fs/write-intent`、`fs/edit-intent` 是 1-4-1 tools 笔记中 pre/post-execute waterfall 之外的**能力自有扩展点**（loop 之外的 service 级 waterfall），单槽决策 + 默认 undefined 的语义完全一致
- **tool/result meta 的 opaque 契约**：diff/read 的 replay-safe meta 正是 session 笔记「append 校验 JSON-serializable」与 tools 笔记「presentResult 从持久化恢复」的消费端；`FsReadMeta`/`FsDiffMeta` 是「producing tool 拥有并 narrow 这个 opaque shape」的实例
- **观察者-守卫者闭环**：fs/observed（观察）+ intent/guard（守卫）与 session 事件溯源、tools 执行管线构成观察-响应闭环的完整样例
- **scope/sandbox 复用**：FsSandboxController 与 tool-bash 共享 `dsh-sandbox` 词表与 fail-closed 批准序列（escalation 同构）；事件载体沿用 `scopeTarget` carrier 约定
- system-prompt 的 `tool:*` section order 100–102 与 tools 的 COLLAPSE_SECTION_ORDER 99 相邻——read 族不 collapse、write/edit 可被 code mode 覆盖，装配顺序有讲究

## 待 1-4-3 用测试印证

- 测试布局：fs 2 文件（service 184 + invariant 55）、fs-local 3 文件（fsio 929 + filesystem 781 + win32 146）、tool-fs 8 文件（tools 929 + integration 515 + read-image 499 + read-render 218 + diff 113 + error 35 + e2e 78 + harness 35）
- 验证点：
  1. `FS_STALE_VERSION` vs `FS_NOT_OBSERVED` 的精确触发边界（version 不匹配 / 目标不存在 / createIfAbsent 撞已有 / 从未读过）
  2. `withLock` FIFO 串行化 + realpath 别名共享 guard（软链写入后主路径 stale）
  3. 二进制拒绝（前 8192 含 NUL 采样）+ `readWholeBytes` maxBytes 双保险
  4. read 窗口精确性（offset 越界抛错 / truncatedByBytes footer / 巨行截断）
  5. replay-safe meta：畸形 meta → generic fallback 不 throw
  6. sandbox 升级：schema 层拒绝（非 confining）+ 批准后严格更宽 retry + `[sandbox: …]` 标记保留 `FS_SANDBOX_DENIED` code
  7. read_image gate 顺序：无 attachments / 无 image 能力的 model / IMAGE_TYPE_MISMATCH（扩展名与字节不符）
  8. e2e（fs-tools.e2e.ts 78 行）里的真实链路：read → write → edit → 再读 version 推进
