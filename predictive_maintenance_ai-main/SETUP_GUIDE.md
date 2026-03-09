# 🚀 PostgreSQL Migration & Setup Guide

## Overview

This guide covers:
1. ✅ Migrating from Supabase to Local PostgreSQL
2. ✅ Setting up the custom vehicle simulator
3. ✅ Integrating the simulator with the AI backend
4. ✅ Complete system deployment

---

## 📋 Prerequisites

### Required Software
- **Python 3.11+** ([Download](https://www.python.org/downloads/))
- **Node.js 18+** ([Download](https://nodejs.org/))
- **PostgreSQL 16** ([Download](https://www.postgresql.org/download/))
- **Docker Desktop** (Optional - recommended) ([Download](https://www.docker.com/products/docker-desktop/))
- **Git** ([Download](https://git-scm.com/downloads))

### Check Installations
```powershell
python --version   # Should be 3.11+
node --version     # Should be 18+
psql --version     # Should be 16+
docker --version   # Optional
```

---

## 🗄️ Part 1: PostgreSQL Database Setup

### Option A: Using Docker (Recommended - Easiest)

#### 1. Start PostgreSQL with Docker Compose
```powershell
cd c:\kathir\Final_Year_Project\predictive_maintenance_ai-main

# Start PostgreSQL + pgAdmin
docker-compose up -d

# Verify containers are running
docker ps
```

You should see:
- `predictive_maintenance_db` (PostgreSQL)
- `pgadmin` (Database management UI)

#### 2. Access pgAdmin
- Open browser: http://localhost:5050
- Login:
  - Email: `admin@predictive.com`
  - Password: `admin`

#### 3. Connect to Database in pgAdmin
- Right-click "Servers" → "Register" → "Server"
- **General Tab:**
  - Name: `Predictive Maintenance`
- **Connection Tab:**
  - Host: `postgres` (inside Docker) or `localhost` (from host)
  - Port: `5432`
  - Database: `predictive_maintenance`
  - Username: `postgres`
  - Password: `postgres`

---

### Option B: Manual PostgreSQL Installation

#### 1. Install PostgreSQL 16
Download and install from: https://www.postgresql.org/download/windows/

During installation:
- Set password for `postgres` user (remember this!)
- Port: `5432` (default)
- Keep default locale

#### 2. Create Database
```powershell
# Open PostgreSQL command line (psql)
psql -U postgres

# Inside psql:
CREATE DATABASE predictive_maintenance;
\c predictive_maintenance
\q
```

#### 3. Run Initialization Script
```powershell
cd c:\kathir\Final_Year_Project\predictive_maintenance_ai-main

# Run the schema creation script
psql -U postgres -d predictive_maintenance -f database\init.sql
```

---

## 🔧 Part 2: Backend Setup (Python/FastAPI)

### 1. Create Virtual Environment
```powershell
cd c:\kathir\Final_Year_Project\predictive_maintenance_ai-main

# Create venv
python -m venv venv

# Activate it
.\venv\Scripts\activate

# You should see (venv) in your prompt
```

### 2. Install Python Dependencies
```powershell
# Upgrade pip
python -m pip install --upgrade pip

# Install all requirements
pip install -r requirements.txt

# This may take 5-10 minutes
```

### 3. Configure Environment Variables
```powershell
# Copy the example file
cp .env.example .env

# Edit .env with your favorite editor (Notepad, VS Code, etc.)
notepad .env
```

**Update these values in `.env`:**
```env
# Database
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/predictive_maintenance
POSTGRES_PASSWORD=YOUR_PASSWORD

# AI (Get your Groq API key from https://console.groq.com/)
GROQ_API_KEY=gsk_your_actual_groq_key_here

# Application
ENVIRONMENT=development
DEBUG=True
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

### 4. Test Database Connection
```powershell
# Run the database test script
python database.py
```

Expected output:
```
🔗 Connecting to: localhost:5432/predictive_maintenance
✅ Database connection successful!
```

### 5. Start FastAPI Backend
```powershell
# Make sure you're in the project root with venv activated
python -m app.main

# Or use uvicorn directly:
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Expected output:
```
🚀 Starting Server...
INFO:     Will watch for changes in these directories: [...]
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [...]
INFO:     Started server process [...]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

**Test it:**
- Open browser: http://localhost:8000
- You should see: `{"status":"AI System Online","version":"1.0.0"}`
- API Docs: http://localhost:8000/docs

---

## 🎮 Part 3: Vehicle Simulator Setup (Next.js)

### 1. Navigate to Simulator Directory
```powershell
cd c:\kathir\Final_Year_Project\Simulation
```

### 2. Install Node.js Dependencies
```powershell
npm install

# This may take 2-5 minutes
```

### 3. Build the Application (Optional - for production)
```powershell
npm run build
```

### 4. Start Simulator in Development Mode
```powershell
npm run dev

# Or use the custom server with WebSocket support:
node server.js
```

Expected output:
```
> Ready on http://localhost:3000
> WebSocket server ready on ws://localhost:3000/api/socket
```

### 5. Open Simulator Dashboard
- Open browser: http://localhost:3000
- You should see the Vehicle Telemetry Dashboard
- Click **"Start Simulation"** button

---

## 🔗 Part 4: Connect Simulator → Backend

### Method A: Direct API Integration

Update the simulator to send data to your FastAPI backend:

**File:** `Simulation/app/page.tsx` (around line 65-70)

```typescript
// Change from internal API to FastAPI backend
fetch('http://localhost:8000/api/telematics', {  // Changed URL
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
}).catch(console.error);
```

### Method B: Use Fleet Simulator (Python)

This sends multiple vehicles' data simultaneously:

```powershell
# Back in the backend directory
cd c:\kathir\Final_Year_Project\predictive_maintenance_ai-main

# Activate venv if not already
.\venv\Scripts\activate

# Run the fleet simulator
python fleet_simulator.py
```

This will:
- Load vehicle data from `engine_data.csv`
- Simulate 7 vehicles (V-301 to V-403)
- Send critical fault data to the AI backend
- Trigger predictive analysis

---

## 🧪 Part 5: Testing the Complete System

### Test 1: Database Connection
```powershell
cd predictive_maintenance_ai-main
python _check_db.py
```

### Test 2: Backend API
```powershell
# In browser or use curl/PowerShell:
Invoke-RestMethod -Uri http://localhost:8000 -Method GET

# Expected: {"status":"AI System Online","version":"1.0.0"}
```

### Test 3: Send Test Telemetry
```powershell
# Create test_request.json
@"
{
  "vehicle_id": "V-TEST-001",
  "metadata": {"model": "Test Vehicle"},
  "engine_temp_c": 115,
  "oil_pressure_psi": 15,
  "rpm": 3000,
  "battery_voltage": 11.5,
  "dtc_readable": "P0217"
}
"@ | Out-File -Encoding utf8 test_request.json

# Send it
Invoke-RestMethod -Uri http://localhost:8000/api/predictive/run `
  -Method POST `
  -ContentType "application/json" `
  -InFile test_request.json
```

### Test 4: Verify Database Entry
```sql
-- In psql or pgAdmin:
SELECT * FROM vehicles ORDER BY created_at DESC LIMIT 5;
SELECT * FROM telematics_logs ORDER BY timestamp_utc DESC LIMIT 5;
SELECT * FROM ai_analysis_results ORDER BY analysis_timestamp DESC LIMIT 5;
```

---

## 🎯 Part 6: Complete Workflow Test

### Start All Services (3 Terminals)

**Terminal 1: PostgreSQL (if not using Docker)**
```powershell
# If using Docker, skip this - it's already running
```

**Terminal 2: FastAPI Backend**
```powershell
cd c:\kathir\Final_Year_Project\predictive_maintenance_ai-main
.\venv\Scripts\activate
python -m app.main
```

**Terminal 3: Vehicle Simulator**
```powershell
cd c:\kathir\Final_Year_Project\Simulation
npm run dev
# or: node server.js
```

### Watch the System Work

1. **Open Simulator Dashboard**: http://localhost:3000
2. **Click "Start Simulation"** - Watch 10 vehicles streaming telemetry
3. **Open Backend Logs** - See real-time data processing
4. **Check Database** - See entries appearing in `telematics_logs`

5. **Trigger AI Analysis**:
   ```powershell
   cd predictive_maintenance_ai-main
   python fleet_simulator.py
   ```

6. **Check Results**:
   - Backend logs will show AI agent processing
   - Database query:
     ```sql
     SELECT vehicle_id, risk_level, diagnosis_report, analysis_timestamp
     FROM ai_analysis_results
     ORDER BY analysis_timestamp DESC
     LIMIT 10;
     ```

---

## 📊 Database Schema Overview

Your database has 6 main tables:

1. **vehicles** - Vehicle registry with owner info
2. **telematics_logs** - Real-time sensor data (50+ fields)
3. **ai_analysis_results** - AI predictions and diagnoses
4. **service_bookings** - Maintenance scheduling
5. **notifications** - Alerts and reminders
6. **ueba_logs** - Security event logging

Plus 2 helpful views:
- `vehicle_health_overview` - Current health status
- `recent_critical_alerts` - Active critical issues

---

## 🔍 Useful Queries

### Check Vehicle Status
```sql
SELECT * FROM vehicle_health_overview;
```

### Recent Critical Alerts
```sql
SELECT * FROM recent_critical_alerts ORDER BY analysis_timestamp DESC;
```

### Telemetry for Specific Vehicle
```sql
SELECT 
    timestamp_utc,
    speed_kmh,
    rpm,
    engine_temp_c,
    oil_pressure_psi,
    battery_voltage,
    engine_health,
    brake_health
FROM telematics_logs
WHERE vehicle_id = 'V-301'
ORDER BY timestamp_utc DESC
LIMIT 20;
```

### AI Analysis History
```sql
SELECT 
    vehicle_id,
    analysis_timestamp,
    risk_level,
    risk_score,
    detected_issues,
    recommended_action
FROM ai_analysis_results
ORDER BY analysis_timestamp DESC;
```

---

## ⚙️ Configuration Tips

### Performance Tuning

**PostgreSQL (`postgresql.conf`):**
```ini
# Increase connection pool
max_connections = 100

# Increase shared memory
shared_buffers = 256MB
effective_cache_size = 1GB

# For development - disable synchronous commits (faster)
synchronous_commit = off  # Don't use in production!
```

**Backend (`.env`):**
```env
# For production, disable debug mode
DEBUG=False
ENVIRONMENT=production

# Add monitoring
# SENTRY_DSN=your_sentry_dsn_here
```

### Security Best Practices

1. **Change default passwords** in `.env` and `docker-compose.yml`
2. **Use environment-specific .env files** (`.env.dev`, `.env.prod`)
3. **Never commit `.env` files** to Git (already in `.gitignore`)
4. **Use secrets management** in production (Azure Key Vault, AWS Secrets Manager)

---

## 🐛 Troubleshooting

### Database Connection Failed
```
❌ Database connection failed: FATAL: password authentication failed
```
**Solution:**
- Double-check password in `.env`
- Verify PostgreSQL is running: `docker ps` or check Windows Services
- Test connection manually: `psql -U postgres -d predictive_maintenance`

### Port Already in Use
```
ERROR: Could not bind to 0.0.0.0:8000
```
**Solution:**
```powershell
# Find process using port 8000
netstat -ano | findstr :8000

# Kill that process
taskkill /PID <process_id> /F
```

### Module Not Found Errors
```
ImportError: No module named 'fastapi'
```
**Solution:**
```powershell
# Ensure venv is activated
.\venv\Scripts\activate

# Reinstall dependencies
pip install -r requirements.txt
```

### Simulator Won't Start
```
Error: Cannot find module 'next'
```
**Solution:**
```powershell
cd Simulation
rm -r node_modules
rm package-lock.json
npm install
```

### AI Agent Errors
```
❌ 'master_agent' could not be imported
```
**Solution:**
- Check all node files exist in `app/agents/nodes/`
- Verify Groq API key is set in `.env`
- Check backend logs for detailed error messages

---

## 📚 Next Steps

### 1. Frontend Integration
- Connect React dashboard to FastAPI backend
- Display AI predictions in UI
- Add real-time WebSocket updates

### 2. Deployment
- Deploy PostgreSQL to cloud (Azure Database, AWS RDS)
- Deploy FastAPI to cloud (Azure App Service, AWS ECS)
- Deploy Next.js simulator (Vercel, Netlify)

### 3. Production Enhancements
- Add authentication (JWT tokens)
- Implement rate limiting
- Set up monitoring (Prometheus, Grafana)
- Add logging (ELK stack, Azure Monitor)
- Implement CI/CD pipeline

### 4. Data Pipeline
- Schedule regular data ingestion jobs
- Implement data archival strategy
- Add data backup automation
- Set up data analytics dashboards

---

## 📖 Additional Resources

- **FastAPI Docs**: https://fastapi.tiangolo.com/
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **SQLAlchemy Docs**: https://docs.sqlalchemy.org/
- **Next.js Docs**: https://nextjs.org/docs
- **LangChain Docs**: https://python.langchain.com/docs/
- **Groq API**: https://console.groq.com/docs

---

## ✅ Verification Checklist

- [ ] PostgreSQL is running and accessible
- [ ] Database schema is initialized
- [ ] Python virtual environment is activated
- [ ] All Python dependencies are installed
- [ ] `.env` file is configured with correct values
- [ ] FastAPI backend starts without errors
- [ ] Health check endpoint returns 200 OK
- [ ] Node.js dependencies are installed
- [ ] Simulator starts and displays dashboard
- [ ] Simulator can send data to backend
- [ ] Backend receives and processes telemetry data
- [ ] AI agent pipeline completes successfully
- [ ] Data appears in PostgreSQL tables
- [ ] Fleet simulator can trigger AI analysis
- [ ] pgAdmin can connect to database

---

## 🎉 You're All Set!

Your system is now:
- ✅ Running on **local PostgreSQL** (no Supabase dependency)
- ✅ Using **custom physics-based simulator** (no Wokwi dependency)
- ✅ Processing data through **AI agent pipeline**
- ✅ Storing results in **structured database**
- ✅ Ready for **development and testing**

**Questions or issues?** Check the troubleshooting section or review the logs for detailed error messages.
