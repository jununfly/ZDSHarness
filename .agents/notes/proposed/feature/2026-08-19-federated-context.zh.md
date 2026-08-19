# Agent Note: 联邦上下文采用外部记忆 Adapter

Status: proposed

[English](2026-08-19-federated-context.md) | 中文

## 问题

Human-led 的多设备、多 Agent 协作需要带权限过滤的共享上下文，并保留 owner、provenance、freshness 和冲突证据。Git、roadmap、Work Packet、claim、预算和发布授权仍是协作控制事实源，因此 memory 系统不能拥有或替代这些事实。

## 提案

定义由 ZHarness 持有的 `FederatedContext` capability seam，包括 Service Definition、Consumer、TencentDB-Agent-Memory HTTP Provider 和 in-memory Provider。TencentDB-Agent-Memory 作为外部运行时部署；其 L0–L3 模型、存储类型、SDK 类型和迁移细节全部留在 Provider 内。MyContext 保留为设备私有上下文候选 Provider，不作为第一共享实现。

首个 PoC 在包实现前验证身份映射、ACL enforcement、provenance、幂等、revision conflict、跨设备 freshness、trace、备份和恢复。Git 和版本化协作资产继续作为 canonical source；共享 memory 是可检索投影。

## 考虑过的替代方案

**Fork TencentDB-Agent-Memory。** 这会在 PoC 证明上游存在不可弥补缺口前就做出判断，并让 ZHarness 承担 Gateway、存储、迁移、SDK 和可观测性维护。

**复制部分上游实现。** 这会重复 memory pipeline 和部署机制，同时失去上游维护。ZHarness 只把领域概念吸收到自己的小 Interface 中。

**第一共享实现使用 MyContext。** 它的本地 SQLite vault 和个人 ingestion 模型适合设备私有上下文，但没有同等的 team、Agent、ownership 和集中式 Gateway 模型。

**不做 PoC 并继续搜索。** 只有同时满足远程共享、身份、ACL、provenance、冲突、幂等和部署要求的候选才进入补充比较；没有明确 Pareto 优势即停止搜索。

## 验收标准

- 两设备 PoC 完成授权检索，并拒绝 private、跨 team 和跨 Agent 访问。
- 写入保留 owner、访问策略、Work Packet provenance、source revision 和 content fingerprint。
- 重复请求不会产生重复 logical record，过期 revision 会产生可恢复冲突。
- 正常网络下跨设备 freshness 达到拟定 p95 目标，网络恢复后没有静默丢失。
- ZHarness 测试通过同一个 `FederatedContext` Interface 覆盖 TencentDB-Agent-Memory 和 in-memory Provider。

## 风险

TencentDB-Agent-Memory 暴露 version，但可能没有对写入执行 compare-and-swap。其 ACL 实现可能没有覆盖所有 Gateway 路径，集中部署也增加运行和迁移责任。PoC 必须让这些缺口导致提案失败，而不是用调用方假设掩盖。
