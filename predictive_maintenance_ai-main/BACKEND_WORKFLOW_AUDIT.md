# Backend Workflow Audit (Demo Checklist)

Date: 2026-04-08
Scope: Simulation -> ML Risk Scoring (XGBoost + Rules) -> Agent Routing -> Customer Alert -> Customer Confirmation -> Service Booking

## Overall Status
- Core workflow is implemented end-to-end.
- Customer confirmation is implemented, but currently enforced mainly for configured pilot vehicles/channels.
- There are two scheduling paths (agent-node path and API recommendation path); API recommendation path is more complete and should be treated as canonical for demos.

## Step-by-Step Audit

### 1) Simulation telemetry generated and transferred to backend
Status: IMPLEMENTED

Evidence:
- Simulation tick and batch send: Simulation/hooks/use-simulation.ts
- Next API ingest + forward queue/retry: Simulation/app/api/telematics/route.ts
- FastAPI telemetry ingest endpoint: predictive_maintenance_ai-main/app/api/routes_telematics.py

What happens:
- Simulation generates per-vehicle telemetry snapshots.
- Batches are posted to /api/telematics.
- Next route normalizes and forwards to FastAPI /api/telematics.
- FastAPI persists logs/live state and emits stream events.

### 2) ML model (XGBoost) creates risk score
Status: IMPLEMENTED

Evidence:
- Hybrid scoring orchestration: predictive_maintenance_ai-main/app/domain/risk_scoring.py
- XGBoost model load/predict: predictive_maintenance_ai-main/app/domain/ml_risk_model.py
- Data analysis node applying hybrid score: predictive_maintenance_ai-main/app/agents/nodes/data_analysis.py

What happens:
- Rules score is always computed.
- XGBoost score is computed when model is available and enabled.
- Final score is blended with guardrails so rules cannot be downplayed.

### 3) If risk above threshold, route to analysis/diagnosis agents
Status: IMPLEMENTED

Evidence:
- Risk level thresholds in hybrid logic: predictive_maintenance_ai-main/app/domain/risk_scoring.py
- Supervisor routing logic (observe_only/diagnosis_only/full_pipeline): predictive_maintenance_ai-main/app/agents/nodes/supervisor.py
- Full graph sequence: predictive_maintenance_ai-main/app/agents/master.py
- Diagnosis node (LLM with rule fallback): predictive_maintenance_ai-main/app/agents/nodes/diagnosis.py

Current routing behavior:
- LOW + no issues -> observe_only
- MEDIUM/WATCH -> diagnosis_only
- HIGH/CRITICAL -> full_pipeline

### 4) Alert sent to customer
Status: IMPLEMENTED (WITH CONDITIONS)

Evidence:
- Customer content generation: predictive_maintenance_ai-main/app/agents/nodes/customer_engagement.py
- Notification insert and predictive persistence: predictive_maintenance_ai-main/app/api/routes_predictive.py
- Scheduling recommendation notifications and stream events: predictive_maintenance_ai-main/app/api/routes_scheduling.py

Notes:
- Alerts are sent through notification records and optional SMS/email channel logic.
- For some vehicles/channels, delivery behavior depends on pilot configuration.

### 5) Customer accepts schedule date
Status: IMPLEMENTED

Evidence:
- SMS inbound confirmation endpoint: predictive_maintenance_ai-main/app/api/routes_scheduling.py
- Email confirmation endpoints (GET/POST): predictive_maintenance_ai-main/app/api/routes_scheduling.py

What happens:
- YES/NO decision is parsed and validated (ID/code, expiry, sender checks).
- Recommendation status is updated to confirmed/declined/conflict as applicable.

### 6) After acceptance, booking is created in service center
Status: IMPLEMENTED

Evidence:
- Booking creation after recommendation approval/confirmation: predictive_maintenance_ai-main/app/api/routes_scheduling.py
- Service booking insert + vehicle status update: predictive_maintenance_ai-main/app/api/routes_scheduling.py
- Legacy direct booking endpoint: predictive_maintenance_ai-main/app/api/routes_scheduling.py

What happens:
- On confirm path, service_bookings row is created.
- vehicles.status and next_service_date are updated.
- Stream and notification events are emitted.

## Gaps / Risks

### A) Confirmation not mandatory for all vehicles
Status: PARTIAL

Details:
- Confirmation-first behavior is strongest for pilot-configured vehicles/channels.
- Non-pilot flow may move faster to booking depending on path.

Impact:
- Business rule "always wait for customer acceptance before booking" is not globally enforced.

### B) Two scheduling implementations can diverge
Status: PARTIAL

Details:
- Agent node scheduling: predictive_maintenance_ai-main/app/agents/nodes/scheduling.py
- API recommendation/confirmation flow: predictive_maintenance_ai-main/app/api/routes_scheduling.py

Impact:
- Harder to reason about a single canonical workflow during demos and maintenance.

### C) Trigger-source can bypass full pipeline
Status: BY DESIGN (but demo-sensitive)

Details:
- Frontend manual diagnosis route can force diagnosis_only.

Impact:
- If demo expects full chain (customer alert + booking path), use full-pipeline trigger path explicitly.

## Recommended Quick Actions (Deadline-Friendly)

1. Enforce global confirmation-first for HIGH/CRITICAL
- In predictive/scheduling paths, require customer YES before any booking insert.

2. Declare one canonical scheduling flow
- Prefer API recommendation/confirmation flow in routes_scheduling.py.
- Keep agent scheduling node thin or delegate to API flow.

3. Add explicit route/threshold config block
- Centralize thresholds and route mapping into one config for easy defense in viva.

4. Add audit trace output for each run
- Store: vehicle_id, risk_score, risk_level, route, alert_sent, confirmation_status, booking_id, timestamps.

## Demo Script (Safe Order)

1. Run simulation feed.
2. Show risk score from hybrid model (rule + ML).
3. Show supervisor route selected.
4. Show diagnosis output + customer alert record.
5. Send YES confirmation (email or SMS endpoint).
6. Show booking created + vehicle status updated.

## Final Assessment
- Your requested workflow is implemented in the codebase with production-style components.
- For strict "acceptance required before booking" policy, add one final global guard and keep one scheduling path as canonical.
