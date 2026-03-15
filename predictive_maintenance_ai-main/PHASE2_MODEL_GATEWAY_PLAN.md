# Phase 2: Shared LLM Gateway (Implemented)

## Goal
Centralize model invocation so all LLM nodes share retry, timeout, and fallback behavior with consistent telemetry.

## Implemented
- Added shared gateway module at `app/agents/llm_gateway.py`.
- Added per-profile model selection with optional environment overrides.
- Added retry loop per model and fallback across model list.
- Added timeout guard around each LLM request.
- Migrated LLM nodes to gateway:
  - diagnosis
  - customer engagement
  - voice interaction
  - feedback
  - manufacturing
- Updated node telemetry to capture actual model chosen at runtime.
- Updated `.env.example` with gateway/model policy controls.

## Environment Controls
- `GROQ_BASE_URL`
- `AGENT_MODEL_DEFAULT`
- `AGENT_MODEL_FALLBACK`
- `AGENT_MODELS_<PROFILE>` (optional, comma-separated)
- `LLM_TIMEOUT_SECONDS`
- `LLM_RETRIES_PER_MODEL`
- `LLM_RETRY_BACKOFF_SECONDS`

## Validation Status
- Static diagnostics: no errors in modified files.
- Remaining runtime validation:
  1. Trigger each orchestration route and verify `model_used_by_node` values.
  2. Force a model failure (bad model override) and confirm fallback model is used.
  3. Force timeout and confirm retry/backoff behavior.
