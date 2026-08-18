# Agent Note: 调研证据与报告编译器

Status: implemented

[English](2026-08-18-research-evidence-and-report-compilers.md) | 中文

## 问题

最初的技术调研组合直接向模型暴露仓库搜索和 README 读取。Revision 一致性、证据权威性、评分轴分离、报告结构、发布次数和运行事实都由 prompt 指令维持。这种组合无法阻止移动分支混合来源、导航摘要变成证据、未覆盖判据变成否定声明，或模型编写的回执与真实执行不一致。同一调研方法也无法被 skill 复用，除非复制 prompt 行为。

## 决策

[`dsh-research`](../../../../packages/research/research) 负责三个版本化值：`zj-research-brief/v1`、`zj-verified-evidence-ledger/v1` 和 `zj-research-report-ir/v1`。一次 `EvidenceCompiler` 调用处理带共享判据和整次运行预算的完整多仓库 brief。它可以组合显式仓库与确定性 GitHub discovery，把 stars 与 topic match 作为两个 ledger 事实保留，在读取 tree 或 file 前把每个选中仓库解析到 commit，每个仓库／判据组合最多保留一条 canonical excerpt，并把每个未覆盖组合记录为 unknown。

仓库导航与 canonical evidence 使用不同类型。确定性 navigator 和可选的内部 DeepWiki MCP adapter 只返回候选路径。DeepWiki 通过精确仓库 allowlist 启用，其工具不会注册给模型；失败时先记录 diagnostic，再回退 heuristic。只有从固定 commit 读取的 GitHub file 能进入 canonical evidence。Agent Consumer 把完整 ledger 写入 `research/evidence-collected`，并返回不含仓库 tree 的有界 `zj-research-evidence-digest/v1`；Report prepare 读取持久 ledger，不从模型接收它。Cache entry 只有在 normalized brief、policy version 和所有仓库 revision 都匹配时才有效；standalone CLI 在 Harness home 下原子保存经过 schema 校验的 entry，并在损坏或 key 不匹配时 loud fail。

Report IR 显式表达 Evidence → Claim → Comparison → Recommendation 引用。Compiler 会拒绝缺少 canonical evidence 的 critical claim、损坏的引用、不完整的指标定义、缺失的 diagram role，以及与 ledger 不一致的 report candidate score。它确定性投影 `technical-c4/v1` 与 `zj-draft/v1`；后者只包含 claim 引用的来源，并输出普通内联链接与可见的编号来源清单，而 sealed ledger 保留全部 evidence。[`dsh-research-report`](../../../../packages/research/research-report) 校验各 family 的 Markdown，并派生保留相同引用目标的离线 HTML。[`dsh-tool-research-report`](../../../../packages/research/tool-research-report) 在签发一次性 publication token 前校验两个产物。Publish 使用仅在目标不存在时创建的写入，保持 Markdown 权威性，并追加由应用拥有的 receipt 与 evaluation event。

调研健康状态从 durable fact 派生，不依赖模型 prose。Session projection 暴露 prepare attempts、invalid attempts、publish count、latest receipt、互不重叠的模型 token usage 和 latest evaluation。六个 correctness 字段全部以 100% 为健康门槛。Collection duration、source bytes、source files、cache use、coverage、degradation 和模型 token 通过 [`dsh-research-telemetry-otel`](../../../../packages/research/research-telemetry-otel) 导出低基数 OTel instrument。Efficiency threshold 只在 30 次可比较样本后出现，并使用 median、p95 与 median absolute deviation。

[`dsh-research-cli`](../../../../packages/research/research-cli) 通过 stdin/stdout 上的 `zj-research-cli/v1` 暴露相同 compiler，包括从最终 Markdown 按 family 派生 HTML。`describe` operation 支持 fail-loud compatibility check。ZAgentic 的 `zj-research` 与 `zj-research-report` skill 调用这个 standalone protocol；其 Git 仓库保持 skill source of record，agent runtime directory 只是安装投影。

较早的[技术方案调研 agent](2026-08-17-technical-research-agent.md) 仍负责 Markdown-first artifact 和共享 JSON-RPC／ACP 组合决策。本记录取代其中由模型控制的仓库读取、评分、报告组装与执行事实机制。

## 曾考虑的替代方案

**在 compiler 旁保留原始 GitHub tool。** 否决，因为模型可以绕过 revision pinning、budget、unknown handling 与 cache identity。调研 preset 只暴露完整 brief compiler；原始 GitHub Consumer 仍可供其他 composition 使用。

**把 DeepWiki answer 当作 evidence。** 否决，因为派生 wiki prose 可能过时，无法证明固定仓库 revision 中包含什么。DeepWiki 只提高路径召回率；GitHub source byte 保持权威性。

**让 Agent 与 skill 路线分别编写 Markdown。** 否决，因为比较结果会把编排差异与不同事实和校验规则混在一起。两条路线共享 ledger 与 Report IR compiler，同时保留各自交互流程和 report family。

**从最终回复文本推断健康状态。** 否决，因为模型无法权威得知 publication race、consumed token、file path、hash、durable count 或 provider token accounting。Session event、projection、receipt 与 metric export 负责这些事实。

## 后果

公共调研 caller 提供 topic、criteria、repository seed 或 discovery、policy version，以及文件、字节和 deadline budget；它不编排单次 GitHub 或 DeepWiki 读取。Compiler 按剩余仓库数分配剩余文件与字节容量，使未使用容量向后流转，同时避免靠前仓库消耗整次运行。缺失证据与 deadline 耗尽保持可见，并可阻断 critical report claim。固定题库 real-API e2e 使用与里程碑比较相同的三个 harness 仓库；确定性测试覆盖 fallback、revision drift、fair allocation、cache identity 与 corruption、deadline degradation、score tampering、duplicate publication、receipt mismatch 和 30 样本阈值。

DeepWiki 增加外部延迟，但不增加证据权威性，因此需要显式 allowlist。Deadline 会停止 canonical collection，但不会把未覆盖准则转换为否定结论；provider selection 与 revision pinning 保留各自的上游 failure semantics。OTel 在达到 30 次运行门槛前导出原始 efficiency observation，不假装早期阈值稳定。凭据门控的 Agent 场景拥有自己的 watchdog，它会在报告超时诊断前关闭 JSON-RPC runtime；测试运行器的 timeout 不是生命周期控制器。原生 Agent 与 skill 盲评仍是里程碑 evaluation，不是确定性 acceptance rule。比较性 evaluation 会向两条路线提供同一份版本化 Research Brief：共享 compiler 能保证证据与校验语义，但各自选择判据会定义不同的决策函数。
