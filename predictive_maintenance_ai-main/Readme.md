# 🔧 Predictive Maintenance AI — Multi-Agent Fleet Intelligence Platform

An end-to-end **AI-powered predictive maintenance system** for vehicle fleet management, built with a **LangGraph multi-agent pipeline**, **FastAPI** backend, **React + TypeScript** dashboard, and **Spring Boot** auth service. The platform ingests real-time IoT telematics via MQTT, performs AI-driven risk analysis and diagnosis using **Groq (Llama 3.3 70B)**, and automates customer engagement, service scheduling, and manufacturing feedback — all secured by a **UEBA (User & Entity Behavior Analytics)** policy engine.

---

## 📑 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [AI Agent Pipeline](#ai-agent-pipeline)
- [Data Flow](#data-flow)
- [Project Structure](#project-structure)
- [Features](#features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [Auth Service Setup](#auth-service-setup)
  - [IoT Listener (Optional)](#iot-listener-optional)
  - [Fleet Simulator (Optional)](#fleet-simulator-optional)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Security — UEBA](#security--ueba)
- [Knowledge Base (RAG)](#knowledge-base-rag)

---

## Architecture Overview

```
┌──────────────┐    MQTT     ┌──────────────┐          ┌───────────────┐
│  IoT Sensors │───────────▶│ IoT Listener  │────────▶│   Supabase    │
│  (Wokwi/HW) │            │ (iot_listener) │         │  (PostgreSQL) │
└──────────────┘            └──────────────┘          └───────┬───────┘
                                                              │
┌──────────────┐   HTTP POST  ┌──────────────┐               │
│    Fleet     │─────────────▶│   FastAPI     │◄──────────────┘
│  Simulator   │              │  Backend:8000 │
└──────────────┘              └──────┬───────┘
                                     │  master_agent.invoke()
                                     ▼
                          ┌──────────────────────┐
                          │  LangGraph Pipeline  │
                          │  (7 AI Agent Nodes)  │
                          └──────────┬───────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
             ┌───────────┐  ┌──────────────┐  ┌───────────┐
             │ Groq LLM  │  │ Knowledge    │  │   gTTS    │
             │ Llama 3.3 │  │ Base (RAG)   │  │  (Voice)  │
             └───────────┘  └──────────────┘  └───────────┘
                                     │
                                     ▼
                          ┌──────────────────────┐
                          │   React + TS         │
                          │   Dashboard :5173    │
                          └──────────┬───────────┘
                                     │
                          ┌──────────────────────┐
                          │  Spring Boot Auth    │
                          │  Service :8080       │
                          └──────────────────────┘
```

---


## Tech Stack

| Layer | Technology |
|---|---|
| **AI Agent Orchestration** | LangGraph (StateGraph) · LangChain · Groq (Llama 3.3 70B) |
| **Backend API** | FastAPI · Uvicorn · Python 3.11+ |
| **Cloud Database** | Supabase (PostgreSQL) |
| **IoT Ingestion** | MQTT (Paho) via public Mosquitto broker |
| **Auth Service** | Spring Boot 4 · Java 21 · JWT · Google OAuth2 · SQLite |
| **Frontend** | React 18 · TypeScript · Vite · Tailwind CSS · Radix UI · Recharts |
| **Voice Synthesis** | gTTS (Google Text-to-Speech) |
| **Knowledge Base** | JSON-based RAG (Retrieval-Augmented Generation) |
| **Security** | UEBA policy engine with agent-level access control |

---

## AI Agent Pipeline

The system uses **LangGraph's StateGraph** to orchestrate a **7-node sequential pipeline**. All nodes share an `AgentState` TypedDict, creating a clean data pipeline where each node reads and writes specific state fields.

```
START
  │
  ▼
┌─────────────────────┐  Query Supabase for vehicle + owner + telematics
│  1. Data Analysis   │  Run rule-based risk scoring engine
│                     │  Output: risk_score, risk_level, detected_issues
└─────────┬───────────┘
          ▼
┌─────────────────────┐  Groq LLM + RAG from knowledge_base.json
│  2. Diagnosis       │  Root cause analysis + action plan + severity
│                     │  Output: diagnosis_report, priority_level
└─────────┬───────────┘
          ▼
┌─────────────────────┐  LLM drafts customer SMS/notification
│  3. Customer Eng.   │  Auto-authorizes Critical; simulates user "YES"
│                     │  Output: customer_script, customer_decision
└─────────┬───────────┘
          ▼
┌─────────────────────┐  Generates voice transcript (Critical only)
│  4. Voice Agent     │  gTTS converts AI dialogue to MP3 audio
│                     │  Output: voice_transcript, audio_url
└─────────┬───────────┘
          ▼
┌─────────────────────┐  Smart slot finder with collision detection
│  5. Scheduling      │  UEBA-secured booking (09:00-17:00 slots)
│                     │  Output: booking_id
└─────────┬───────────┘
          ▼
┌─────────────────────┐  Post-service satisfaction follow-up
│  6. Feedback        │  Output: feedback message
└─────────┬───────────┘
          ▼
┌─────────────────────┐  CAPA engineering report (skips Low priority)
│  7. Manufacturing   │  Flaw analysis + engineering fix + validation
│                     │  Output: manufacturing_recommendations
└─────────┬───────────┘
          ▼
         END
```

### Risk Scoring Engine

The rule-based engine in `risk_rules.py` calculates a 0–100 risk score:

| Condition | Points |
|---|---|
| Engine temp > 110°C | +40 |
| Oil pressure < 20 psi | +50 |
| Active DTC codes | +30 |

| Score Range | Risk Level |
|---|---|
| 0–19 | LOW |
| 20–39 | MEDIUM |
| 40–74 | HIGH |
| 75–100 | CRITICAL |

---

## Data Flow

```
IoT Sensors ──MQTT──▶ iot_listener.py ──▶ Supabase (telematics_logs)
                                                │
fleet_simulator.py ──HTTP POST──────────▶ routes_predictive.py
                                                │
                                                ▼
                                         master_agent.invoke()
                                                │
                               ┌────────────────┴────────────────┐
                               ▼                                 ▼
                     Supabase Read                    Knowledge Base RAG
                     (vehicles + owners +             (knowledge_base.json)
                      telematics_logs)                       │
                               │                             ▼
                               ▼                        Groq LLM
                          Risk Rules                   (Diagnosis)
                               │                             │
                               └──────────┬──────────────────┘
                                          ▼
                                  Customer Notification
                                          ▼
                                  Voice Call (Critical)
                                          ▼
                                  Auto-Scheduling
                                          ▼
                                  Feedback + CAPA
                                          ▼
                             Supabase Write (results persist)
                                          ▼
                             React Dashboard (real-time view)
```

---

## Project Structure

```
predictive_maintenance_ai-main/
│
├── app/                          # Python backend (FastAPI + AI Agents)
│   ├── main.py                   # FastAPI entrypoint (CORS, route registration)
│   ├── knowledge_base.json       # 2,300+ line automotive service manual for RAG
│   │
│   ├── agents/                   # LangGraph multi-agent system
│   │   ├── master.py             # StateGraph builder & compiler
│   │   ├── state.py              # AgentState TypedDict (shared pipeline state)
│   │   ├── tools.py              # UEBA-secured tool wrappers
│   │   └── nodes/                # Individual agent node implementations
│   │       ├── data_analysis.py  # Node 1: Supabase query + risk scoring
│   │       ├── diagnosis.py      # Node 2: LLM + RAG diagnosis
│   │       ├── customer_engagement.py  # Node 3: Customer notification
│   │       ├── voice_agent.py    # Node 4: Voice call + gTTS audio
│   │       ├── scheduling.py     # Node 5: Smart slot booking
│   │       ├── feedback.py       # Node 6: Post-service follow-up
│   │       └── manufacturing_insights.py  # Node 7: CAPA report
│   │
│   ├── api/                      # REST API routes
│   │   ├── routes_predictive.py  # POST /api/predictive/run (trigger AI pipeline)
│   │   ├── routes_fleet.py       # Fleet management (status, activity, bookings)
│   │   ├── routes_telematics.py  # GET vehicle sensor readings
│   │   ├── routes_scheduling.py  # File-based booking (legacy)
│   │   └── routes_notifications.py  # Placeholder
│   │
│   ├── config/
│   │   └── settings.py           # Application configuration
│   │
│   ├── data/                     # Data access layer
│   │   ├── iot_listener.py       # MQTT IoT bridge → Supabase
│   │   ├── loaders.py            # Mock data loader (offline fallback)
│   │   └── repositories.py      # Local JSON data repositories
│   │
│   ├── domain/                   # Business logic
│   │   ├── mapping.py            # OBD-II DTC code → description mapper
│   │   └── risk_rules.py         # Rule-based risk scoring engine
│   │
│   ├── ueba/                     # Security — User & Entity Behavior Analytics
│   │   ├── middleware.py          # secure_call() gatekeeper
│   │   ├── policies.py           # Agent access control matrix
│   │   ├── storage.py            # In-memory security event log
│   │   └── anomaly.py            # Anomaly detection (extensible stub)
│   │
│   └── utils/
│       └── knowledge.py          # RAG retrieval from knowledge_base.json
│
├── auth-service/                 # Spring Boot JWT auth microservice (Java 21)
│   ├── pom.xml                   # Maven config (Spring Boot 4, SQLite, JWT)
│   └── src/
│       └── main/resources/
│           └── application.properties  # Port 8080, JWT secret, Google OAuth
│
├── frontend/                     # React + TypeScript dashboard
│   ├── package.json              # Dependencies (React 18, Radix, Recharts, MUI)
│   ├── vite.config.ts            # Vite build configuration
│   └── src/
│       ├── App.tsx               # Auth-gated routing
│       ├── services/api.ts       # Axios API client (with offline fallbacks)
│       ├── context/AuthContext.tsx  # JWT + cookie auth context
│       └── components/
│           ├── auth/             # Login & Register screens
│           ├── dashboard/        # Master dashboard (map, metrics, activity)
│           ├── vehicle-health/   # Per-vehicle telematics gauges
│           ├── scheduling/       # Service booking interface
│           ├── manufacturing/    # CAPA report viewer
│           ├── security/         # UEBA event panel
│           └── settings/         # User/system settings
│
├── data_samples/                 # Sample data & run logs
│   ├── vehicles.json             # Vehicle registry
│   ├── telematics.json           # Static telematics snapshots
│   ├── collected_data.json       # Aggregated fleet data
│   └── run_log_V-*.json          # Per-vehicle run logs
│
├── tests/                        # Test suite
│   ├── test_flow.py              # End-to-end pipeline test
│   ├── test_key.py               # API key validation test
│   └── list_models.py            # Available model lister
│
├── database.py                   # Supabase client singleton
├── engine_data.csv               # 19,500+ rows of real engine telemetry
├── fleet_simulator.py            # Load-testing tool (7 concurrent vehicles)
├── requirements.txt              # Python dependencies
└── Readme.md                     # This file
```

---

## Features

### AI & Analytics
- **Multi-agent AI pipeline** — 7 specialized LangGraph nodes working in sequence
- **Groq-powered LLM inference** — Uses Llama 3.3 70B for diagnosis, customer scripts, and CAPA reports
- **RAG-enhanced diagnosis** — 2,300+ line automotive knowledge base for contextual repair guidance
- **Rule-based risk scoring** — Engine temp, oil pressure, and DTC code analysis (0–100 scale)
- **OBD-II DTC mapping** — Translates fault codes (P0217, P0524, P0300, P0171) to plain English

### Fleet Operations
- **Real-time IoT ingestion** — MQTT listener bridges sensor data into Supabase
- **Fleet dashboard** — Interactive map, metrics cards, activity feed, agent status
- **Smart scheduling** — Collision-aware slot booking with business-hours enforcement
- **Voice alerts** — gTTS-generated MP3 voice calls for Critical-priority issues
- **Customer engagement** — Automated SMS/notification drafting with auto-authorization

### Security
- **UEBA policy engine** — Agent-level access control matrix (who can call what)
- **Secure middleware** — Every inter-agent call passes through `secure_call()` gatekeeper
- **Audit logging** — All ALLOWED/BLOCKED events recorded with timestamps
- **JWT authentication** — Spring Boot auth with 24-hour token expiry
- **Google OAuth2** — Social login integration

### Frontend
- **Auth-gated SPA** — Login/Register → Dashboard with page navigation
- **6 dashboard pages** — Dashboard, Vehicle Health, Scheduling, Manufacturing, Security, Settings
- **Offline resilience** — Mock data fallbacks when backend is unreachable
- **Modern UI** — Tailwind CSS, Radix UI primitives, Recharts visualizations, MUI components

---

## Getting Started

### Prerequisites

| Tool | Version |
|---|---|
| **Python** | 3.11+ |
| **Node.js** | 18+ |
| **Java** | 21 (for auth-service) |
| **Maven** | 3.9+ (for auth-service) |

You'll also need:
- A **Supabase** project (free tier works) with `vehicles`, `owners`, and `telematics_logs` tables
- A **Groq API key** (for Llama 3.3 70B inference)
- (Optional) A **Google OAuth Client ID** for social login

### Backend Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd predictive_maintenance_ai-main

# 2. Create and activate virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

# 3. Install Python dependencies
pip install -r requirements.txt
pip install supabase python-dotenv paho-mqtt gtts

# 4. Create .env file in the project root
# (See Environment Variables section below)

# 5. Start the FastAPI server
python -m app.main
```

The backend will be running at **http://localhost:8000**.

### Frontend Setup

```bash
# 1. Navigate to the frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
```

The frontend will be running at **http://localhost:5173**.

### Auth Service Setup

```powershell
# 1. Navigate to the auth service directory
 
 cd C:\kathir\Final_Year_Project\predictive_maintenance_ai-main; .venv\Scripts\activate.ps1; python -m app.main
```

For macOS/Linux:
```bash
export JAVA_HOME=/usr/lib/jvm/java-21
./mvnw spring-boot:run
```

The auth service will be running at **http://localhost:8080**.

### IoT Listener (Optional)

To receive real-time MQTT sensor data (e.g., from Wokwi simulations):

```bash
python app/data/iot_listener.py
```

This connects to `test.mosquitto.org` and listens on `hackathon/truck/+/telematics`.

### Fleet Simulator (Optional)

To load-test the system with 7 concurrent vehicles sending critical-condition data:

```bash
python fleet_simulator.py
```

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key

# Groq (LLM)
GROQ_API_KEY=your-groq-api-key

# (Optional) OpenRouter alternative
OPENROUTER_API_KEY=your-openrouter-key
```

For the auth service, configure in `auth-service/src/main/resources/application.properties`:
- JWT secret key
- Google OAuth client ID

---

## API Endpoints

### Predictive AI

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/predictive/run` | Trigger full AI agent pipeline for a vehicle |

### Telematics

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/telematics/{vehicle_id}` | Get latest sensor readings for a vehicle |

### Fleet Management

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/fleet/status` | Full fleet dashboard (vehicles + owners + telematics) |
| `GET` | `/api/fleet/activity` | Agent activity log / event feed |
| `POST` | `/api/fleet/create` | Book a service appointment |

### Health Check

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | System health check |

---

## Security — UEBA

The **User & Entity Behavior Analytics** module provides defense-in-depth for the multi-agent system:

### Access Control Matrix

| Agent | Allowed Services |
|---|---|
| `DataAnalysisAgent` | TelematicsRepo, VehicleRepo |
| `DiagnosisAgent` | LLM_Inference |
| `CustomerEngagementAgent` | LLM_Inference |
| `SchedulingAgent` | SchedulerService |

Any unauthorized call is **blocked and logged** with a `PermissionError`.

### How It Works

1. Agent calls `secure_call(agent_name, service_name, func, ...)`
2. `policies.py` checks the access control matrix
3. `storage.py` logs the event (ALLOWED or BLOCKED)
4. If allowed, the function executes; otherwise, an exception is raised

---

## Knowledge Base (RAG)

The system includes a **2,300+ line automotive knowledge base** (`app/knowledge_base.json`) covering:

- **ABS** — Anti-lock Braking System diagnostics
- **AC** — Air Conditioning system troubleshooting
- **Engine** — Overheating, oil, ignition, fuel system analysis
- **And more** — Categorized by subcategory with symptoms and step-by-step diagnosis procedures

The `diagnosis_node` performs RAG by:
1. Extracting symptom keywords from detected issues
2. Searching the knowledge base via `find_diagnosis_steps()`
3. Injecting matching repair procedures into the LLM prompt
4. Generating a contextually-enriched diagnosis report

---

## License

This project was developed as a **Final Year Project / EY Hackathon** submission.
