# Multi-Agent Predictive Maintenance System — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SIMULATION LAYER (Next.js :3000)                     │
│                                                                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ... (7 vehicles)     │
│  │ V-301   │ │ V-302   │ │ V-303   │ │ V-401   │                      │
│  │Simulator│ │Simulator│ │Simulator│ │Simulator│                      │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘                      │
│       │            │            │            │                           │
│       └────────────┴─────┬──────┴────────────┘                          │
│                          │ Every 2s: Batch telemetry                    │
│                   ┌──────▼──────┐                                       │
│                   │ Fleet Panel │ ← AI results displayed per vehicle    │
│                   └─────────────┘                                       │
└─────────────────────────────┬───────────────────────────────────────────┘
                              │
                    POST /api/telematics (bulk)
                    POST /api/analyze (per vehicle)
                              │
┌─────────────────────────────▼───────────────────────────────────────────┐
│                    AI BACKEND (FastAPI :8000)                            │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   TELEMETRY INGEST                               │    │
│  │  routes_telematics.py                                            │    │
│  │  • Field mapping (camelCase→snake_case via _pick())              │    │
│  │  • Risk score calculation                                        │    │
│  │  • AUTO-TRIGGER: If risk ≥ 40 → launch AI pipeline              │    │
│  └──────────────────────────┬──────────────────────────────────────┘    │
│                              │                                          │
│  ┌──────────────────────────▼──────────────────────────────────────┐    │
│  │              LANGGRAPH MULTI-AGENT PIPELINE                      │    │
│  │                                                                   │    │
│  │  ┌─────────────┐   ┌───────────┐   ┌────────────────────┐       │    │
│  │  │ 1. DATA     │──▶│ 2. DIAG-  │──▶│ 3. CUSTOMER        │       │    │
│  │  │ ANALYSIS    │   │ NOSIS     │   │ ENGAGEMENT         │       │    │
│  │  │             │   │           │   │                    │       │    │
│  │  │ • DB lookup │   │ • LLM     │   │ • LLM drafts msg  │       │    │
│  │  │ • Risk calc │   │ • RAG     │   │ • Auto-authorize   │       │    │
│  │  │ • Issues    │   │ • Priority│   │   Critical cases   │       │    │
│  │  └─────────────┘   └───────────┘   └────────┬───────────┘       │    │
│  │                                               │                   │    │
│  │  ┌─────────────┐   ┌───────────┐   ┌────────▼───────────┐       │    │
│  │  │ 7. MANUFAC- │◀──│ 6. FEED-  │◀──│ 5. SCHEDULING      │       │    │
│  │  │ TURING      │   │ BACK      │   │                    │       │    │
│  │  │             │   │           │   │ • Collision detect │       │    │
│  │  │ • CAPA      │   │ • Post-   │   │ • Auto-book for   │       │    │
│  │  │ • Design    │   │   service │   │   Critical/Booked  │       │    │
│  │  │   flaws     │   │   follow  │   │ • DB persistence   │       │    │
│  │  └─────────────┘   └───────────┘   └────────▲───────────┘       │    │
│  │                                               │                   │    │
│  │                                     ┌────────┴───────────┐       │    │
│  │                                     │ 4. VOICE AGENT     │       │    │
│  │                                     │ (Critical only)    │       │    │
│  │                                     │ • Phone transcript │       │    │
│  │                                     │ • TTS audio (MP3)  │       │    │
│  │                                     └────────────────────┘       │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  POST-PIPELINE: persist_analysis_outputs()                              │
│  • telematics_logs INSERT                                               │
│  • vehicles UPDATE (risk score, status)                                 │
│  • ai_analysis_results INSERT (full pipeline output)                    │
│  • notifications INSERT (customer message)                              │
│  • service_bookings INSERT (if booked)                                  │
│                                                                         │
│  ENDPOINTS:                                                             │
│  • POST /api/predictive/run    — Run full AI pipeline                   │
│  • POST /api/telematics        — Ingest + auto-trigger                  │
│  • GET  /api/telematics/{id}   — Latest readings                        │
│  • GET  /api/fleet/status      — Fleet overview                         │
│  • GET  /api/fleet/activity    — Agent activity log                     │
│  • GET  /api/fleet/dashboard   — Aggregated fleet view                  │
│  • GET  /api/notifications     — All notifications                      │
│  • POST /api/scheduling/create — Manual booking                         │
│  • GET  /api/scheduling/list   — All bookings                           │
│  • GET  /audio/{file}          — Voice recordings (static)              │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │    PostgreSQL :5432          │
                    │                              │
                    │  vehicles (7 seed)           │
                    │  telematics_logs             │
                    │  ai_analysis_results         │
                    │  service_bookings            │
                    │  notifications               │
                    │  ueba_logs                   │
                    └──────────────────────────────┘

## Data Flow (End-to-End)

1. **Simulation** creates 7 `VehicleSimulator` instances (V-301..V-403)
2. Every 2 seconds, all 7 vehicles tick → batch POST to `/api/telematics`
3. Telemetry is field-mapped, risk-scored, and inserted into `telematics_logs`
4. If risk ≥ 40: **auto-trigger** runs the full 7-node AI pipeline
5. Every 30s (or on critical status): dashboard sends POST to `/api/analyze`
6. AI Analysis → Diagnosis → Customer Notification → Voice (if Critical)
   → Scheduling → Feedback → Manufacturing CAPA
7. All results persisted to DB (ai_analysis_results, notifications, bookings)
8. Dashboard polls fleet overview showing per-vehicle risk, diagnosis, bookings

## Agent Node Details

| # | Agent               | Input                          | Output                              | LLM? |
|---|---------------------|--------------------------------|-------------------------------------|------|
| 1 | Data Analysis       | vehicle_id                     | vehicle_metadata, risk_score, issues| No   |
| 2 | Diagnosis           | telematics, issues             | diagnosis_report, priority_level    | Yes  |
| 3 | Customer Engagement | diagnosis, priority            | customer_script, customer_decision  | Yes  |
| 4 | Voice Agent         | diagnosis (Critical only)      | voice_transcript, audio_url         | Yes  |
| 5 | Scheduling          | priority, customer_decision    | booking_id, scheduled_date          | No   |
| 6 | Feedback            | booking_id                     | feedback_request                    | Yes  |
| 7 | Manufacturing       | diagnosis (not Low)            | manufacturing_recommendations       | Yes  |

## Running the System

### Terminal 1 — PostgreSQL
```bash
cd predictive_maintenance_ai-main
docker-compose up -d
```

### Terminal 2 — FastAPI Backend  
```bash
cd predictive_maintenance_ai-main
.venv\Scripts\activate
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Terminal 3 — Simulation Dashboard
```bash
cd Simulation
npm run dev
```

### Terminal 4 — Auth Service (optional)
```bash
cd predictive_maintenance_ai-main/auth-service
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21"
./mvnw spring-boot:run
```

Open http://localhost:3000 → Click "Start Fleet" → Watch all 7 vehicles simulate.
```