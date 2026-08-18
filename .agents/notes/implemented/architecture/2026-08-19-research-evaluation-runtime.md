# Agent Note: Research evaluation runtime

Status: implemented

English | [中文](2026-08-19-research-evaluation-runtime.zh.md)

## Problem

Publication health proves that a report and its citations are structurally consistent, but it cannot establish that evidence entails a claim or that a recommendation helps a team decide. Success-only telemetry also omits runs that fail before publication. Comparing Agent and skill orchestration through separately generated briefs or revisions confounds orchestration quality with evidence drift.

## Decision

`@deepseek-ai/dsh-research-eval` owns comparative evaluation outside the Evidence and Report compilers. A versioned experiment manifest fixes the compiler artifact, policy, model, Judge, report family, cache cohort, navigation configuration, budgets, corpus cases, arms, and repetitions. Controlled cases require a shared sealed-ledger fingerprint; native cases remain a separate lane.

The runtime accepts injected arm and blind Judge adapters through one `run()` interface. It appends a version-two start fact before external work and exactly one terminal fact before returning. Version-two receipts derive from the append-only pair and retain four independent layers: operational health, structural correctness, evidence quality, and decision usefulness. Decision usefulness records rubric score, recommendation acceptability, and omitted-risk count. Cohort reliability uses every start as its denominator, while semantic and efficiency baselines require 30 successful reports that pass structural hard gates.

Human evaluation uses three immutable asset types. A rubric set fixes scenario-specific weighted criteria and immediate Judge-calibration thresholds. An annotation set records each quality case's expected evidence state, source-span hashes, required tradeoffs and risks, acceptable recommendation set, and whether abstention is valid. A calibration set pairs human and blind-Judge scores for one immutable report per quality case. Cross-validation rejects missing cases, mismatched versions or Judge configuration, ambiguous evidence states, and calibration below policy before a run enters the baseline cohort.

The shared compiler remains unique, but orchestration routes do not need a single implementation. An Agent may become the default team entry while a skill remains available for a distinct workflow. A route is retired only when evaluation and usage show that it has no independent value.

## Alternatives considered

**Extend `dsh-research`.** The compiler would then own experiment arms, model configuration, repetition, and Judge policy. Those concerns change independently from evidence and report semantics, so the larger interface would reduce locality and make skill consumers inherit evaluation machinery.

**Keep cross-repository scripts in ZAgentic.** Scripts can launch a comparison but cannot give every host the same manifest validation, lifecycle failure classes, or receipt projection. The shared mechanism belongs beside the compiler; ZAgentic owns skill definitions, rubrics, manifests, and research artifacts.

**Use one weighted score.** A total hides whether one route is more reliable while another produces better evidence or decisions. Hard structural gates apply uniformly; the remaining dimensions stay visible as a Pareto comparison until a deployment policy assigns priorities.

**Measure successful publications only.** This produces survivorship bias because collection, model, Judge, cancellation, and budget failures disappear. Start-only logs remain incomplete reliability outcomes instead.

## Consequences

Experiment hosts must provide durable event storage plus explicit arm and Judge adapters. The first standalone CLI validates manifests and projects receipts; production Agent and skill hosts remain separate adapters. Raw provider diagnostics stay in controlled logs or Error causes, while durable receipts retain stable failure classes.

Versioned manifests, evaluation assets, and immutable receipts make controlled comparisons reproducible and preserve native-route differences. They also add an artifact-governance obligation: corpus, rubric, annotation, or calibration semantic changes create a new version and never merge into an existing baseline. Judge-calibration thresholds apply before sampling; cohort SLOs remain unset until 30 comparable successful reports exist.

## Verification

Package tests cover controlled-manifest invariants, blind Judge requests, exactly one terminal fact, cancellation, duration and resource budgets, adapter and Judge failures, JSONL durability, torn logs, rubric and annotation ambiguity, every calibration threshold, complete case coverage, the 30-sample floor, and a real CLI process.
