import os
import sys
import socket
import multiprocessing
from datetime import datetime, timezone
from typing import Any, Dict

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Load .env reliably from project root regardless of current working directory.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

from database import check_database_connection, execute_query
from app.domain.ml_risk_model import get_model_status

# ✅ FIX 1: Correct Imports matching your file structure (app/api/routes_*.py)
# You do not have a 'routers' folder, so we import directly from app.api
from app.api import routes_predictive, routes_telematics, routes_fleet, routes_test, routes_notifications, routes_scheduling, routes_stream
from app.services.escalation_queue import escalation_queue


def _read_csv_env(name: str, default: str) -> list[str]:
    raw_value = str(os.getenv(name, default)).strip()
    values = [part.strip() for part in raw_value.split(",") if part.strip()]
    return values or [part.strip() for part in default.split(",") if part.strip()]


app = FastAPI(title="Predictive Maintenance AI API")

# --- CORS SETUP ---
cors_origins = _read_csv_env(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
)
cors_allow_credentials = "*" not in cors_origins
if not cors_allow_credentials:
    print("[StartupWarning] CORS_ORIGINS includes '*' so allow_credentials is forced to False.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Static Files: Serve audio recordings ---
AUDIO_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data_samples")
os.makedirs(AUDIO_DIR, exist_ok=True)
app.mount("/audio", StaticFiles(directory=AUDIO_DIR), name="audio")

# --- Register Routes ---
app.include_router(routes_predictive.router, prefix="/api/predictive", tags=["AI"])
app.include_router(routes_telematics.router, prefix="/api/telematics", tags=["Data"])
app.include_router(routes_fleet.router, prefix="/api/fleet", tags=["Fleet"])
app.include_router(routes_test.router, prefix="/api/test", tags=["Testing"])
app.include_router(routes_notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(routes_scheduling.router, prefix="/api/scheduling", tags=["Scheduling"])
app.include_router(routes_stream.router, prefix="/api/stream", tags=["Streaming"])


REQUIRED_TABLES = (
    "vehicles",
    "telematics_logs",
    "vehicle_live_state",
    "anomaly_events",
    "telemetry_minute_aggregates",
    "ai_analysis_results",
    "service_bookings",
    "notifications",
)


def _env_flag(name: str, default: bool = False) -> bool:
    raw_value = str(os.getenv(name, str(default))).strip().lower()
    return raw_value in {"1", "true", "yes", "on"}


def _is_port_available(host: str, port: int) -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind((host, port))
        return True
    except OSError:
        return False
    finally:
        sock.close()


def _check_required_tables() -> Dict[str, Any]:
    values_sql = ", ".join([f"('{table_name}')" for table_name in REQUIRED_TABLES])
    query = (
        "SELECT required.table_name, "
        "(to_regclass('public.' || required.table_name) IS NOT NULL) AS present "
        f"FROM (VALUES {values_sql}) AS required(table_name)"
    )

    try:
        rows = execute_query(query, fetch=True)
        missing = [str(row.get("table_name")) for row in rows if not row.get("present")]
        return {
            "missing_tables": missing,
            "error": None,
        }
    except Exception as exc:
        return {
            "missing_tables": list(REQUIRED_TABLES),
            "error": f"schema_check_failed:{exc.__class__.__name__}",
        }


def _collect_startup_readiness() -> Dict[str, Any]:
    strict_mode = _env_flag("STARTUP_STRICT_READINESS", False)
    require_ml_model = _env_flag("STARTUP_REQUIRE_ML_MODEL", False)

    checks: Dict[str, Any] = {
        "database": {
            "connected": False,
            "missing_tables": [],
            "error": None,
        },
        "ml_model": {
            "enabled": _env_flag("ML_RISK_ENABLED", True),
            "available": False,
            "path": None,
            "model_name": None,
            "reason": None,
        },
    }

    blockers = []
    warnings = []

    db_connected = check_database_connection()
    checks["database"]["connected"] = db_connected
    if db_connected:
        schema_check = _check_required_tables()
        checks["database"]["missing_tables"] = schema_check["missing_tables"]
        checks["database"]["error"] = schema_check["error"]
        if schema_check["missing_tables"]:
            blockers.append("database_missing_required_tables")
            warnings.append(f"Missing tables: {', '.join(schema_check['missing_tables'])}")
    else:
        checks["database"]["error"] = "database_unreachable"
        blockers.append("database_unreachable")
        warnings.append("Database not reachable at startup")

    ml_enabled = checks["ml_model"]["enabled"]
    if ml_enabled:
        model_status = get_model_status()
        checks["ml_model"].update(model_status)
        if not model_status.get("available"):
            if require_ml_model:
                blockers.append("ml_model_unavailable")
            warnings.append(
                "ML model unavailable; hybrid scoring will use rules only "
                f"({model_status.get('reason')})"
            )
    else:
        checks["ml_model"]["reason"] = "disabled_by_env"
        if require_ml_model:
            blockers.append("ml_model_disabled")

    return {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "strict_mode": strict_mode,
        "require_ml_model": require_ml_model,
        "checks": checks,
        "blockers": blockers,
        "warnings": warnings,
    }


@app.on_event("startup")
async def startup_event():
    readiness = _collect_startup_readiness()
    app.state.startup_readiness = readiness

    for warning in readiness.get("warnings", []):
        print(f"[StartupWarning] {warning}")

    if readiness.get("strict_mode") and readiness.get("blockers"):
        blockers = ", ".join(readiness["blockers"])
        raise RuntimeError(f"Startup readiness failed in strict mode: {blockers}")

    await escalation_queue.start(worker_count=1)


@app.on_event("shutdown")
async def shutdown_event():
    await escalation_queue.stop()

@app.get("/")
def health_check():
    readiness = getattr(app.state, "startup_readiness", None)
    is_ready = readiness is not None and not readiness.get("blockers")
    return {
        "status": "AI System Online",
        "version": "1.0.0",
        "ready": bool(is_ready),
    }


@app.get("/health/ready")
def readiness_check():
    readiness = getattr(app.state, "startup_readiness", None)
    if not readiness:
        return {
            "ready": False,
            "reason": "startup_checks_not_run",
        }

    return {
        "ready": len(readiness.get("blockers", [])) == 0,
        **readiness,
    }

if __name__ == "__main__":
    # ✅ FIX 2: Correct App Path for Uvicorn
    # This assumes you are running the command from the project ROOT folder
    multiprocessing.set_executable(sys.executable)
    reload_enabled = os.getenv("UVICORN_RELOAD", "false").strip().lower() in {"1", "true", "yes", "on"}
    host = os.getenv("UVICORN_HOST", "0.0.0.0").strip() or "0.0.0.0"
    port = int(str(os.getenv("UVICORN_PORT", "8000")).strip())

    if not _is_port_available(host, port):
        print(f"ℹ️ Backend already running on {host}:{port}. Startup skipped.")
        sys.exit(0)

    print("🚀 Starting Server...")
    uvicorn.run("app.main:app", host=host, port=port, reload=reload_enabled)