# Diagnosis Agent Model Research and Implementation Plan

## 1) Objective
Build a reliable, cost-aware model strategy for the Diagnosis Agent so it can:
- produce stable, structured diagnostics for fleet incidents,
- maintain low latency for live operations,
- degrade gracefully during model/API failures,
- improve measurable quality across root-cause accuracy, severity classification, and actionability.

## 2) Current State (Code Baseline)
- Shared model gateway is already implemented in `app/agents/llm_gateway.py`.
- Diagnosis node currently invokes gateway profile `diagnosis` in `app/agents/nodes/diagnosis.py`.
- Current default policy from `.env.example`:
  - `AGENT_MODEL_DEFAULT=llama-3.3-70b-versatile`
  - `AGENT_MODEL_FALLBACK=llama-3.1-8b-instant`
  - `LLM_TIMEOUT_SECONDS=25`
  - `LLM_RETRIES_PER_MODEL=2`
  - `LLM_RETRY_BACKOFF_SECONDS=1.0`
- Supervisor is rules-based (`app/agents/nodes/supervisor.py`) and can route low-risk events away from expensive LLM paths.

## 3) Known Gaps to Address
- Output parser in diagnosis node relies on regex over free-form markdown; this is brittle under prompt drift.
- No formal offline evaluation set for diagnosis quality.
- No quality guardrails (confidence, evidence coverage, contradiction checks) before writing final report.
- No explicit latency/cost SLO per route and risk level.
- RAG lookup currently uses simple term matching; retrieval relevance is not scored.

## 4) Research Questions
1. Which model mix gives best quality-latency tradeoff for diagnosis tasks?
2. Is one heavy model sufficient, or should we use a staged model strategy (fast model first, heavy model on uncertainty)?
3. What prompt format produces highest structured compliance with least retry overhead?
4. Which retrieval strategy (keyword + synonym + DTC normalization) improves root-cause correctness most?
5. How should severity and action extraction be made deterministic?

## 5) Target Architecture (Diagnosis Model Strategy)
### A. Two-Tier Inference Policy
- Tier 1 (default): fast/cheap model for medium-risk and straightforward cases.
- Tier 2 (escalation): high-capability model for high-risk, critical, or low-confidence Tier 1 outputs.

Routing signals for Tier 2 escalation:
- critical/unsafe telematics thresholds,
- malformed output (missing required fields),
- contradiction between risk score and generated severity,
- low retrieval relevance or no matching manual snippets.

### B. Structured Output Contract
Move diagnosis output from markdown parsing to strict JSON contract.

Required JSON keys:
- `issue_summary`
- `primary_cause`
- `immediate_actions` (array)
- `severity` (`LOW|MEDIUM|HIGH|CRITICAL`)
- `confidence` (0-1)
- `evidence` (array of telematics/manual facts)

Implementation note:
- Keep markdown rendering only as a post-process transform for UI.
- Source-of-truth should be JSON in state and persistence.

### C. Retrieval Upgrade (RAG)
- Normalize query terms:
  - symptom aliases (overheat/thermal/high temp),
  - oil pressure synonyms,
  - DTC code normalization.
- Retrieve top-k manual steps with score metadata.
- Include retrieval citations in diagnosis evidence.

## 6) Evaluation Framework
## 6.1 Dataset Design
Create an offline diagnosis benchmark set with at least 150 scenarios:
- 50 normal/low-risk,
- 50 medium-risk,
- 50 high/critical.

Per scenario include:
- telematics snapshot,
- optional DTC codes,
- expected severity,
- expected top root-cause category,
- required action checklist.

## 6.2 Metrics
Primary metrics:
- Severity accuracy (% exact match)
- Root-cause top-1 accuracy
- Action plan completeness (checklist coverage)
- Structured output validity rate

Reliability metrics:
- Timeout rate
- Fallback activation rate
- Retry success rate

Performance metrics:
- p50/p95 latency per route
- average tokens and estimated cost per request

## 6.3 Acceptance Thresholds
- Structured output validity >= 99%
- Severity accuracy >= 90%
- p95 diagnosis latency <= 8s for medium route, <= 15s for high/critical route
- fallback success (final usable answer after failover) >= 98%

## 7) Rollout Plan
## Phase 1: Instrumentation and Baseline (Week 1)
- Add telemetry counters by model/profile in gateway.
- Log parse failures, timeout reasons, and fallback outcomes.
- Freeze current baseline metrics for comparison.

## Phase 2: Structured Diagnosis Contract (Week 1-2)
- Change diagnosis prompt to strict JSON mode.
- Replace regex severity parsing with deterministic JSON validation.
- Add schema validation and safe fallback behavior.

## Phase 3: Tiered Model Policy (Week 2)
- Add uncertainty/escalation rules in diagnosis node.
- Configure per-profile model lists using:
  - `AGENT_MODELS_DIAGNOSIS`
  - `AGENT_MODELS_DIAGNOSIS_FAST` (new)
  - `AGENT_MODELS_DIAGNOSIS_HEAVY` (new)

## Phase 4: Retrieval Improvements (Week 3)
- Enhance query expansion and DTC normalization.
- Add retrieval score threshold and no-evidence handling.

## Phase 5: A/B Validation and Production Ramp (Week 3-4)
- Run shadow evaluation against benchmark set.
- A/B compare baseline vs new policy on live mirrored traffic.
- Ramp 10% -> 50% -> 100% with rollback gates.

## 8) Safety and Guardrails
- If diagnosis generation fails, keep priority at least `High` for unsafe sensor combinations.
- Never emit empty action plans for `High` or `Critical` severity.
- Add contradiction guard:
  - if model severity < rules severity by 2 levels, clamp to rules severity and annotate reason.

## 9) Configuration Plan
Recommended starting configuration:
- `AGENT_MODELS_DIAGNOSIS=<heavy>,<fast>` for failover.
- `LLM_TIMEOUT_SECONDS=20` for fast route, `25` for heavy route (node-level override).
- `LLM_RETRIES_PER_MODEL=2`.
- `LLM_RETRY_BACKOFF_SECONDS=0.8`.

If environment-specific tuning is needed, keep production and staging profiles separate via `.env` overlays.

## 10) Deliverables
- Updated diagnosis prompt and parser (JSON schema based).
- Model routing policy implementation (fast/heavy escalation logic).
- Benchmark dataset + evaluation script/report.
- Dashboard for latency, fallback, and quality metrics.
- Runbook for rollback and model override operations.

## 11) Open Decisions Needed
1. Confirm primary model vendor strategy for production (single-vendor vs multi-vendor fallback).
2. Confirm target p95 latency SLA for critical incidents.
3. Confirm cost cap per 1,000 diagnosis runs.
4. Confirm whether diagnosis evidence/citations must be user-visible in UI.

## 12) Immediate Next Actions (Execution Order)
1. Implement structured JSON diagnosis output contract.
2. Add schema validation and deterministic severity extraction.
3. Build first 30-scenario benchmark and run baseline.
4. Enable tiered diagnosis model routing with uncertainty escalation.
5. Expand benchmark to 150 scenarios and gate release with acceptance thresholds.
