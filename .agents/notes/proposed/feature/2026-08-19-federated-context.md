# Agent Note: Federated context as an external memory adapter

Status: proposed

English | [中文](2026-08-19-federated-context.zh.md)

## Problem

Human-led collaboration across devices and Agents needs shared, permission-filtered context with ownership, provenance, freshness, and conflict evidence. Git, roadmaps, Work Packets, claims, budgets, and release authorization remain authoritative for collaboration control, so a memory system cannot own or replace those facts.

## Proposal

Define a ZHarness-owned `FederatedContext` capability seam with Service Definition, Consumer, TencentDB-Agent-Memory HTTP Provider, and an in-memory Provider. Deploy TencentDB-Agent-Memory as an external runtime; keep its L0–L3 model, storage types, SDK types, and migration details inside the Provider. MyContext remains a candidate Provider for device-private context rather than the first shared implementation.

The first PoC verifies identity mapping, ACL enforcement, provenance, idempotency, revision conflicts, cross-device freshness, tracing, backup, and recovery before package implementation begins. Git and versioned collaboration artifacts remain the canonical sources; shared memory is a retrievable projection.

## Alternatives considered

**Fork TencentDB-Agent-Memory.** This would assume an unbridgeable upstream gap before the PoC establishes one and would transfer Gateway, storage, migration, SDK, and observability maintenance to ZHarness.

**Copy selected upstream implementation.** This would duplicate the memory pipeline and deployment machinery while losing upstream maintenance. ZHarness instead copies only domain ideas into its own small Interface.

**Use MyContext as the first shared implementation.** Its local SQLite vault and personal ingestion model suit device-private context but do not provide the same team, Agent, ownership, and centralized Gateway model.

**Keep searching without a PoC.** Additional candidates are considered only when they satisfy remote sharing, identity, ACL, provenance, conflict, idempotency, and deployment requirements; search stops without a clear Pareto improvement.

## Acceptance criteria

- A two-device PoC demonstrates authorized retrieval and rejects private, cross-team, and cross-Agent access.
- Writes preserve owner, access policy, Work Packet provenance, source revision, and content fingerprint.
- Duplicate requests do not create duplicate logical records, and stale revisions produce recoverable conflicts.
- Normal-network cross-device freshness reaches the proposed p95 target without silent loss after recovery.
- ZHarness tests exercise the same `FederatedContext` Interface through TencentDB-Agent-Memory and in-memory Providers.

## Same-device first step

The first execution is a same-device Codex–WorkBuddy smoke test, before the two-device Gateway PoC. The stable device slug is `shanghai-macbook-01`; Codex uses `agent-codex-01` and WorkBuddy uses `agent-workbuddy-01`. One Work Packet travels from Codex creation and commit, through WorkBuddy execution and receipt commit, back to Codex verification and acceptance or Human blocking. Git commit and receipt fields are the handoff evidence; private conversation state and uncommitted worktrees are not.

## Risks

TencentDB-Agent-Memory exposes versions but may not enforce compare-and-swap on writes. Its ACL implementation may not cover every Gateway path, and centralized deployment adds operational and migration ownership. The PoC must fail the proposal rather than conceal any of these gaps with caller-side assumptions.
