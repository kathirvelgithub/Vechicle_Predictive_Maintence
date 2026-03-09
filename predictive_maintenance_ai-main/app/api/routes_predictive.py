import json
import traceback
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from database import supabase  # ✅ DB Client

# ✅ IMPORT YOUR AGENT
try:
    from app.agents.master import master_agent
except ImportError:
    print("⚠️ Warning: Could not import 'master_agent'")
    master_agent = None

router = APIRouter()

# --- MODELS (UNCHANGED) ---
class PredictiveRequest(BaseModel):
    vehicle_id: str
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)
    engine_temp_c: Optional[int] = 90
    oil_pressure_psi: Optional[float] = 40.0
    rpm: Optional[int] = 1500
    battery_voltage: Optional[float] = 24.0
    dtc_readable: Optional[str] = "None"

class AnalyzeResponse(BaseModel):
    vehicle_id: str
    risk_score: int
    risk_level: str
    diagnosis: str
    customer_script: Optional[str] = None
    booking_id: Optional[str] = None
    manufacturing_insights: Optional[str] = None
    ueba_alerts: Optional[List[Dict[str, Any]]] = []

def make_serializable(obj):
    if isinstance(obj, dict):
        return {k: make_serializable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [make_serializable(i) for i in obj]
    if isinstance(obj, (str, int, float, bool, type(None))):
        return obj
    return str(obj)

def parse_timestamp(value: Optional[str]) -> Optional[str]:
    if not value or not isinstance(value, str):
        return None

    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f"):
        try:
            return datetime.strptime(value, fmt).isoformat()
        except ValueError:
            continue
    return None

def persist_analysis_outputs(request: PredictiveRequest, result: Dict[str, Any]):
    safe_result = make_serializable(result)
    live_tel = result.get("telematics_data") or {}
    metadata = request.metadata or {}
    skip_telematics_persist = bool(metadata.get("skip_telematics_persist"))

    def _f(key, fallback):
        val = live_tel.get(key)
        try:
            return float(val) if val is not None else fallback
        except (TypeError, ValueError):
            return fallback

    request_has_real_data = (
        request.engine_temp_c != 90
        or request.oil_pressure_psi != 40.0
        or request.dtc_readable not in ("None", None)
    )

    db_log = {
        "vehicle_id": request.vehicle_id,
        "timestamp_utc": datetime.utcnow().isoformat(),
        "engine_temp_c": _f("engine_temp_c", request.engine_temp_c),
        "oil_pressure_psi": _f("oil_pressure_psi", request.oil_pressure_psi),
        "rpm": int(live_tel.get("rpm") or request.rpm),
        "battery_voltage": _f("battery_voltage", request.battery_voltage),
        "vibration_level": result.get("priority_level", "NORMAL").upper(),
        "active_dtc_codes": result.get("detected_issues", []),
        "raw_payload": safe_result,
    }

    selected_slot = parse_timestamp(result.get("selected_slot"))
    scheduled_date = parse_timestamp(result.get("scheduled_date")) or selected_slot
    risk_level = str(result.get("risk_level", "LOW")).upper()
    priority_level = result.get("priority_level", risk_level.title())

    if request_has_real_data and not skip_telematics_persist:
        supabase.table("telematics_logs").insert(db_log).execute()

    supabase.table("vehicles").update({
        "last_risk_score": result.get("risk_score", 0),
        "last_risk_level": risk_level,
        "last_analysis_timestamp": datetime.utcnow().isoformat(),
    }).eq("vehicle_id", request.vehicle_id).execute()

    supabase.table("ai_analysis_results").insert({
        "vehicle_id": request.vehicle_id,
        "risk_score": result.get("risk_score", 0),
        "risk_level": risk_level,
        "detected_issues": result.get("detected_issues", []),
        "diagnosis_report": result.get("diagnosis_report"),
        "recommended_action": result.get("recommended_action"),
        "priority_level": priority_level,
        "customer_script": result.get("customer_script"),
        "customer_decision": result.get("customer_decision"),
        "booking_id": result.get("booking_id"),
        "selected_slot": selected_slot,
        "scheduled_date": scheduled_date,
        "manufacturing_recommendations": result.get("manufacturing_recommendations"),
        "feedback_request": result.get("feedback_request"),
        "ueba_alert_triggered": result.get("ueba_alert_triggered", False),
        "audio_url": result.get("audio_url"),
        "audio_available": result.get("audio_available", False),
        "error_message": result.get("error_message"),
        "processing_time_ms": None,
    }).execute()

    if result.get("customer_script"):
        vehicle_metadata = result.get("vehicle_metadata") or {}
        supabase.table("notifications").insert({
            "vehicle_id": request.vehicle_id,
            "notification_type": "critical" if risk_level == "CRITICAL" else "alert",
            "title": f"Maintenance alert for {request.vehicle_id}",
            "message": result.get("customer_script"),
            "channel": "voice" if result.get("audio_available") else "sms",
            "recipient": vehicle_metadata.get("owner_phone") or vehicle_metadata.get("owner_email"),
        }).execute()

# --- ENDPOINT ---
@router.post("/run", response_model=AnalyzeResponse)
async def predict_failure(request: PredictiveRequest):
    try:
        print(f"📡 [API] Received Analysis Request for: {request.vehicle_id}")

        if not master_agent:
            raise HTTPException(status_code=500, detail="AI Agent Graph not loaded.")

        # 1. SETUP TELEMATICS
        telematics_payload = {
            "engine_temp_c": request.engine_temp_c,
            "oil_pressure_psi": request.oil_pressure_psi,
            "rpm": request.rpm,
            "battery_voltage": request.battery_voltage,
            "dtc_readable": request.dtc_readable
        }

        # 2. PREPARE STATE (Same as your mock logic)
        initial_state = {
            "vehicle_id": request.vehicle_id,
            "vin": None,
            "vehicle_metadata": request.metadata,
            "telematics_data": telematics_payload,
            "detected_issues": [],
            "risk_score": 0,
            "risk_level": "LOW",
            "diagnosis_report": "",
            "recommended_action": "Wait",
            "priority_level": "Low",
            "voice_transcript": [],
            "manufacturing_recommendations": "",
            "ueba_alert_triggered": False,
            "customer_script": "",
            "customer_decision": "PENDING",
            "selected_slot": None,
            "booking_id": None,
            "scheduled_date": None,
            "audio_url": None,
            "audio_available": False,
            "error_message": None,
            "feedback_request": None
        }

        # 3. RUN AGENT
        result = master_agent.invoke(initial_state)

        # 4. UEBA LOGGING
        ueba_list = []
        if result.get("ueba_alert_triggered"):
            ueba_list.append({"message": "Anomalous telemetry pattern detected"})

        try:
            persist_analysis_outputs(request, result)
            print(f"☁️ [DB] Synced AI Analysis for {request.vehicle_id}")
            
        except Exception as db_err:
            print(f"⚠️ Warning: DB sync failed: {db_err}")

        # 5. RETURN RESPONSE
        return AnalyzeResponse(
            vehicle_id=result["vehicle_id"],
            risk_score=result.get("risk_score", 0),
            risk_level=result.get("risk_level", "UNKNOWN").upper(), 
            diagnosis=result.get("diagnosis_report", "No diagnosis generated."),
            customer_script=result.get("customer_script"),
            booking_id=result.get("booking_id"),
            manufacturing_insights=result.get("manufacturing_recommendations"),
            ueba_alerts=ueba_list
        )

    except Exception as e:
        print(f"❌ Error in prediction endpoint: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))