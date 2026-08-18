# @deepseek-ai/dsh-research-eval

English | [中文](README.zh.md)

Versioned experiment runtime for comparing technical-research orchestration routes without changing the Evidence or Report compilers.

`ResearchExperimentRuntime.run()` accepts one `zj-research-experiment/v1` manifest, a case/arm/repetition selection, an arm adapter, a blind Judge adapter, and a durable event sink. Controlled manifests require one sealed-ledger fingerprint per case. The manifest locks compiler artifact, policy, model, Judge, report family, cache cohort, navigation configuration, repetitions, and per-run budgets.

Every accepted run appends `research-eval/run-started` before invoking an adapter and exactly one terminal event before returning. `projectResearchRunReceipt()` accepts only one start followed by one identity-consistent terminal fact. It reports operational, structural, evidence-quality, and decision-usefulness layers separately; `hardGatePassed` derives only from structural invariants, while statistical quality thresholds remain baseline-owned.

`summarizeResearchCohort()` counts every started log for reliability, including a start-only torn log, but admits only completed hard-gate reports to quality and efficiency baselines. The keyless fixtures keep the 10-case, three-repetition bilingual quality matrix separate from injected upstream failures.

`JsonlResearchExperimentEventSink` stores one run per exclusive owner-readable JSONL file and fsyncs each event. A second start refuses the existing path. A torn log containing only the start fact is incomplete and cannot project a receipt.

The `dsh-research-eval` CLI accepts one `zj-research-eval-cli/v1` request on stdin. `validate-manifest` returns the normalized manifest, and `project-receipt` validates a decoded event array before returning its receipt. `describe` reports supported schemas without running an arm.

## Model Experience

Indirectly, through experiment arm and Judge adapters that own any model-visible requests.

#### KV Cache effect

No direct invalidation; each adapter owns its request construction and cache behavior, while the manifest records the selected configuration fingerprint.

## Known Limitations and Deferred Work

- **No production arm host** — the runtime accepts injected Agent and skill adapters, but the standalone CLI currently validates manifests and projects receipts only.
- **No frozen statistical thresholds** — efficiency and semantic-score SLOs remain undefined until each comparable cohort has at least 30 successful report samples.
