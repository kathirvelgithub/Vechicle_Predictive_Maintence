# Predictive Maintenance AI Platform

Production-oriented fleet intelligence platform built with a multi-node AI workflow, real-time telemetry ingestion, and human-in-the-loop service booking.

## Table Of Contents

1. Overview
2. Core Features
3. Phase 2 Agent Upgrades
4. Architecture
5. Repository Structure
6. Technology Stack
7. Quick Start
8. Configuration
9. API Reference
10. Agent Workflow
11. Validation And Testing
12. Troubleshooting
13. Contributing
14. Documentation
15. License

## Overview

This project combines:

- FastAPI backend for telemetry processing and orchestration
- LangGraph agent workflow for diagnosis, planning, verification, and action
- PostgreSQL persistence for vehicle telemetry, recommendations, bookings, and notifications
- Multiple UI clients for operations and simulation
- Spring Boot auth service for identity-related integrations

Primary goal: convert telemetry into reliable maintenance decisions while preventing unsafe auto-booking through explicit customer confirmation.

## Core Features

- Real-time telemetry ingestion and risk scoring
- Agentic diagnosis with LLM gateway fallback policy
- Recommendation and approval workflow for scheduling
- Email and SMS customer confirmation paths
- Booking creation only after explicit YES confirmation
- Voice interaction path for critical scenarios
- Manufacturing insight generation for downstream engineering feedback
- Runtime agent quality metrics endpoint

## Phase 2 Agent Upgrades

Implemented upgrades include:

- Memory context retrieval before diagnosis
- Planner node for explicit per-run execution planning
- Verifier node with guardrails and confidence-based escalation
- Runtime observability metrics for quality tracking

Phase 2 files:

- [app/agents/nodes/memory_context.py](app/agents/nodes/memory_context.py)
- [app/agents/nodes/planner.py](app/agents/nodes/planner.py)
- [app/agents/nodes/verifier.py](app/agents/nodes/verifier.py)
- [app/agents/master.py](app/agents/master.py)
- [app/agents/state.py](app/agents/state.py)

## Architecture

High-level flow:

1. Telematics data arrives from simulator or external producer.
2. Backend normalizes and scores risk signals.
3. Agent graph executes analysis and decision workflow.
4. Recommendations and notifications are persisted.
5. Customer confirmation gates booking creation.
6. Metrics and events are exposed for monitoring.

Key entrypoints:

- Backend app: [app/main.py](app/main.py)
- Predictive routes: [app/api/routes_predictive.py](app/api/routes_predictive.py)
- Scheduling routes: [app/api/routes_scheduling.py](app/api/routes_scheduling.py)

## Repository Structure

- [app](app): FastAPI APIs, agent workflow, services, domain logic
- [database](database): PostgreSQL initialization scripts
- [scripts](scripts): smoke tests, diagnostic and maintenance utilities
- [tests](tests): automated tests
- [frontend](frontend): Vite React frontend
- [service_center_ui](service_center_ui): service center React UI
- [admin_ui](admin_ui): admin React UI
- [auth-service](auth-service): Spring Boot auth service
- [Simulation](../Simulation): Next.js simulation environment

## Technology Stack

Backend:

- FastAPI, Uvicorn, Pydantic
- LangGraph, LangChain, langchain-openai compatible clients
- PostgreSQL via psycopg2 and SQLAlchemy
- XGBoost and scikit-learn for risk modeling

LLM gateway:

- Provider-aware model policy with retries and timeout controls
- Groq, OpenAI-compatible endpoints, optional Ollama

Frontend:

- React + Vite (multiple UIs)
- Next.js simulation app

Auth service:

- Spring Boot 3.3.x, Java 21, JWT and OAuth dependencies

## Quick Start

### 1. Start PostgreSQL

```bash
cd predictive_maintenance_ai-main
docker-compose up -d
```

Compose file: [docker-compose.yml](docker-compose.yml)

### 2. Set up Python environment

```bash
cd predictive_maintenance_ai-main
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Dependencies: [requirements.txt](requirements.txt)

### 3. Configure environment

```bash
copy .env.example .env
```

Template: [.env.example](.env.example)

### 4. Run backend

```bash
cd predictive_maintenance_ai-main
python -m app.main
```

Health:

- `GET /`
- `GET /health/ready`

### 5. Optional UI services

Frontend:

```bash
cd predictive_maintenance_ai-main/frontend
npm install
npm run dev
```

Service center UI:

```bash
cd predictive_maintenance_ai-main/service_center_ui
npm install
npm run dev
```

Admin UI:

```bash
cd predictive_maintenance_ai-main/admin_ui
npm install
npm run dev
```

Simulation:

```bash
cd Simulation
npm install
npm run dev
```

### 6. Optional auth service

```bash
cd predictive_maintenance_ai-main/auth-service
mvnw.cmd spring-boot:run
```

Build config: [auth-service/pom.xml](auth-service/pom.xml)

## Configuration

Core variables are defined in [.env.example](.env.example). Important groups:

- Database connectivity and pool controls
- LLM provider keys and model policy
- Startup readiness flags
- ML risk model controls
- CORS and API runtime settings

Tip: if readiness fails in strict mode during local iteration, review `STARTUP_STRICT_READINESS` and `STARTUP_REQUIRE_ML_MODEL`.

## API Reference

Base URL: `http://localhost:8000`

Predictive:

- `POST /api/predictive/run`
- `GET /api/predictive/metrics/agent-quality`

Telematics:

- `POST /api/telematics`
- `GET /api/telematics/{vehicle_id}`

Fleet:

- `GET /api/fleet/status`
- `GET /api/fleet/activity`
- `GET /api/fleet/dashboard`

Scheduling:

- `POST /api/scheduling/recommendations`
- `GET /api/scheduling/recommendations`
- `GET /api/scheduling/recommendations/pending`
- `POST /api/scheduling/recommendations/{recommendation_id}/approve`
- `POST /api/scheduling/recommendations/{recommendation_id}/reject`
- `GET /api/scheduling/customer-confirmation/email`
- `POST /api/scheduling/customer-confirmation/email`
- `POST /api/scheduling/customer-confirmation/inbound`
- `POST /api/scheduling/customer-confirmation/webhook`

Notifications:

- `GET /api/notifications/`
- `POST /api/notifications/`

Streaming:

- `WS /api/stream/ws`

## Agent Workflow

Workflow definition: [app/agents/master.py](app/agents/master.py)

Current execution path:

- `data_analysis`
- `supervisor`
- `memory_context`
- `diagnosis`
- `planner`
- `customer_engagement`
- `voice_interaction` (critical path)
- `scheduling`
- `verifier`
- `feedback` (can be skipped if verifier blocks)
- `manufacturing`

State contract: [app/agents/state.py](app/agents/state.py)

Safety behavior:

- Booking does not finalize before explicit customer confirmation.
- Verifier can block invalid booking artifacts.
- Low-confidence high-risk plans trigger human review escalation.

## Validation And Testing

Smoke test:

- Script: [scripts/smoke_test_email_confirmation.py](scripts/smoke_test_email_confirmation.py)

Run:

```bash
python scripts/smoke_test_email_confirmation.py
```

Expected behavior:

- Recommendation becomes `pending_customer_confirmation`
- Booking is created only after customer YES confirmation

Generated report:

- [smoke_email_report.json](smoke_email_report.json)

## Troubleshooting

1. Metrics endpoint returns 404
- Cause: old server process still running
- Fix: restart backend with `python -m app.main`

2. Booking appears earlier than expected
- Validate confirmation path in scheduling endpoints
- Run smoke test and inspect report

3. Readiness check fails
- Inspect `/health/ready` response for blockers
- Confirm DB schema and ML model availability

4. Frontend tooling mismatch on local machine
- If Vite issues occur on Node 20.18.0, use Vite 5.x in affected projects

## Contributing

Recommended workflow:

1. Create a feature branch
2. Implement focused changes with tests
3. Run smoke and relevant test suites
4. Open a pull request with context and validation evidence

## Documentation

- [../SYSTEM_ARCHITECTURE.md](../SYSTEM_ARCHITECTURE.md)
- [SETUP_GUIDE.md](SETUP_GUIDE.md)
- [BACKEND_WORKFLOW_AUDIT.md](BACKEND_WORKFLOW_AUDIT.md)
- [SYSTEM_DESIGN_PLAN.md](SYSTEM_DESIGN_PLAN.md)

## License

Use according to your institution or organization policy.
