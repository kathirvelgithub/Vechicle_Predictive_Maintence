## Predictive Maintenance AI - System Design Plan

### Vision
- Build a production-style multi-agent predictive maintenance platform.
- Continuously ingest simulator/IoT telemetry.
- Detect risk early.
- Notify customers automatically.
- Schedule service with minimal human effort.
- Persist all analysis, alerts, and bookings for dashboard visibility.

### Functional Requirements
1. Ingest telemetry from simulator, MQTT devices, and manual API calls.
2. Normalize heterogeneous payloads into one backend telemetry schema.
3. Run multi-agent analysis on current vehicle telemetry.
4. Produce risk score, diagnosis, action plan, and customer message.
5. Auto-schedule service for critical/high-priority cases.
6. Store AI analysis history, notifications, and bookings in PostgreSQL.
7. Show fleet health, alerts, activity, and service state in the frontend.
8. Support voice escalation for critical incidents.
9. Track UEBA security events for agent actions.

### Non-Functional Requirements
- Low-latency API response for telemetry ingestion.
- Safe fallback behavior when LLM or DB is unavailable.
- Idempotent ingestion and scheduling where possible.
- Clear audit trail for analysis, notifications, bookings, and agent actions.
- Extensible agent graph for future optimization and new tools.

### Target Architecture
1. **Ingestion layer**
   - Next.js simulator and Python simulator send telemetry.
   - FastAPI `/api/telematics` stores raw telemetry.
   - MQTT listener stores hardware telemetry.
2. **Orchestration layer**
   - LangGraph coordinates analysis, diagnosis, customer engagement, voice, scheduling, feedback, and manufacturing nodes.
3. **Persistence layer**
   - `telematics_logs`, `ai_analysis_results`, `service_bookings`, `notifications`, `ueba_logs`, `vehicles`.
4. **Presentation layer**
   - React dashboard reads fleet status, bookings, activity, and notifications.

### Agent Responsibilities
- **Data Analysis Agent**: validate vehicle, load latest metadata, assess risk.
- **Diagnosis Agent**: use RAG + LLM to explain root cause and priority.
- **Customer Engagement Agent**: generate customer-facing message.
- **Voice Agent**: create escalation voice output for critical cases.
- **Scheduling Agent**: allocate conflict-free slots and persist bookings.
- **Feedback Agent**: prepare post-service follow-up.
- **Manufacturing Agent**: generate CAPA insights.

### Event Flow
1. Telemetry received.
2. Telemetry normalized and stored.
3. Predictive flow invoked with current telemetry.
4. Risk and diagnosis generated.
5. Notification created.
6. Critical or approved case triggers scheduling.
7. Booking saved and vehicle status updated.
8. Analysis history written for audit/dashboard.

### Current Gaps Identified
- Simulator telemetry was not fully forwarded to FastAPI.
- Predictive flow could analyze stale DB telemetry instead of live request telemetry.
- Scheduling used in-memory booking state instead of persistent DB storage.
- AI analysis history and notifications were not consistently persisted.
- Database compatibility layer had partial Supabase-style behavior.

### Implementation Phases
#### Phase 1 - Pipeline Integrity
- Connect simulator telemetry to FastAPI.
- Normalize telemetry payloads.
- Ensure live telemetry is used during analysis.
- Persist analysis outputs and notifications.

#### Phase 2 - Operational Reliability
- Add idempotency keys for repeated telemetry.
- Persist UEBA events to database.
- Add retries/circuit breakers around LLM calls.
- Add health and metrics endpoints.

#### Phase 3 - Advanced Orchestration
- Introduce conditional LangGraph branches.
- Add asynchronous queue/event bus for high-volume fleet scale.
- Add service center capacity rules and technician assignment.
- Add closed-loop feedback from completed service jobs.

#### Phase 4 - Product Readiness
- Role-based dashboards.
- Analytics for fleet-wide failure trends.
- SLA reporting and notification delivery status.
- Deployment hardening and monitoring.

### Immediate Deliverables Implemented
- FastAPI telemetry ingestion endpoint.
- Simulator telemetry forwarding to FastAPI.
- Live telemetry priority in AI analysis.
- Persistent DB-backed booking creation.
- AI analysis result persistence.
- Notification persistence.

### Recommended Next Build Slice
- Add conditional graph branching and UEBA persistence.
- Add notification delivery workers (SMS/email/WhatsApp provider integration).
- Add booking lifecycle management: pending, confirmed, in-service, completed.