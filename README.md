🚗 Predictive Maintenance AI Platform

Production-oriented fleet intelligence platform that converts vehicle telemetry into safe, verified maintenance decisions using a multi-agent AI workflow.

Built for real-world deployment with human-in-the-loop service booking.

Project Demo Link :  https://drive.google.com/drive/folders/1d5bWMl-5dPuqBN8uUe9Nwr6FS3WR91kY?usp=sharing

✨ Key Highlights
Real-time telemetry ingestion & risk scoring
Multi-agent LLM workflow (LangGraph)
Human confirmation before service booking
Email / SMS / Voice customer interaction
Fleet analytics dashboards & multiple UIs
Manufacturing insights for engineering feedback
Runtime agent quality metrics & observability
🧠 Problem This Solves

Traditional fleet maintenance is reactive and leads to:

Unexpected breakdowns
High downtime costs
Manual scheduling inefficiencies

This platform enables predictive + automated + safe maintenance decisions.

🏗️ System Architecture
High-Level Flow
Telematics data arrives from simulator or external devices
Backend normalizes data and computes risk signals
Multi-agent workflow performs diagnosis and planning
Recommendations are generated and stored
Customer confirmation gates booking creation
Metrics and events exposed for monitoring
🤖 Multi-Agent Workflow

Powered by LangGraph.

Execution pipeline:

data_analysis → supervisor → memory_context → diagnosis → planner
→ customer_engagement → voice_interaction (critical path)
→ scheduling → verifier → feedback → manufacturing
Safety Guardrails
Booking never created without customer confirmation
Verifier blocks unsafe or low-confidence plans
High-risk cases escalate to human review
🔥 Core Features
Telemetry & Risk Modeling
Real-time telemetry ingestion
ML risk scoring using XGBoost + scikit-learn
Memory-aware diagnostics
Agent Intelligence
Planner node for execution strategy
Verifier node with confidence scoring
Runtime quality metrics endpoint
Scheduling & Notifications
Email and SMS confirmation workflow
Voice interaction for critical cases
Booking creation only after explicit YES
Fleet Analytics
Fleet dashboard & activity tracking
Service center and admin dashboards
Manufacturing feedback insights
🧰 Tech Stack
Backend
FastAPI + Uvicorn
LangGraph + LangChain
PostgreSQL (SQLAlchemy + psycopg2)
XGBoost / scikit-learn
LLM Gateway
OpenAI-compatible APIs
Groq support
Optional Ollama local models
Retry & timeout model policy
Frontend
React + Vite (Operations UI)
React Service Center UI
React Admin Dashboard
Next.js Simulation Environment
Auth Service
Spring Boot 3.3 (Java 21)
JWT + OAuth integrations
📂 Repository Structure
app/                FastAPI APIs & agent workflow
database/           PostgreSQL init scripts
tests/              Automated tests
scripts/            Smoke tests & utilities
frontend/           Fleet operations UI
service_center_ui/  Service center dashboard
admin_ui/           Admin dashboard
auth-service/       Spring Boot auth service
Simulation/         Next.js telemetry simulator
🚀 Quick Start
1️⃣ Start PostgreSQL (Docker)
docker-compose up -d
2️⃣ Setup Python Environment
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
3️⃣ Configure Environment
copy .env.example .env
4️⃣ Run Backend
python -m app.main

Health endpoints:

GET /
GET /health/ready
💻 Run Frontend Apps (Optional)
Fleet UI
cd frontend
npm install
npm run dev
Service Center UI
cd service_center_ui
npm install
npm run dev
Admin UI
cd admin_ui
npm install
npm run dev
Simulation Environment
cd Simulation
npm install
npm run dev
🔐 Run Auth Service (Optional)
cd auth-service
mvnw.cmd spring-boot:run
🌐 API Overview

Base URL: http://localhost:8000

Predictive
POST /api/predictive/run
GET /api/predictive/metrics/agent-quality
Telematics
POST /api/telematics
GET /api/telematics/{vehicle_id}
Fleet
GET /api/fleet/status
GET /api/fleet/dashboard
Scheduling
Create / approve / reject recommendations
Customer email confirmation workflow
Streaming
WS /api/stream/ws
🧪 Validation & Testing
Smoke Test
python scripts/smoke_test_email_confirmation.py

Expected result:

Recommendation → pending_customer_confirmation
Booking created only after YES confirmation
🛠️ Troubleshooting
Issue	Fix
Metrics endpoint 404	Restart backend
Booking created early	Validate confirmation workflow
Readiness check fails	Verify DB + ML model availability
Vite issues	Use Vite 5.x
🤝 Contributing
Create feature branch
Add tests + run smoke tests
Submit PR with validation evidence
📚 Documentation
SYSTEM_ARCHITECTURE.md
SETUP_GUIDE.md
BACKEND_WORKFLOW_AUDIT.md
SYSTEM_DESIGN_PLAN.md
