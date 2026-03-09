from datetime import datetime
from typing import Any, Dict, List, Union
import traceback

from fastapi import APIRouter, HTTPException
from database import supabase  # ✅ DB Client
from app.domain.risk_rules import calculate_risk_score

# Keep this import for fallback/mock data if DB is empty
try:
    from app.data.repositories import TelematicsRepo 
except ImportError:
    TelematicsRepo = None

# Import the AI agent for auto-trigger
try:
    from app.agents.master import master_agent
except ImportError:
    master_agent = None

router = APIRouter()

# Track recently analyzed vehicles to avoid flooding
_recent_auto_analyses: Dict[str, float] = {}
AUTO_ANALYSIS_COOLDOWN = 60  # seconds between auto-triggers per vehicle

def normalize_dtc_codes(value: Any) -> List[str]:
    if value in (None, "", "None", "Healthy"):
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        values = value.split(",") if "," in value else [value]
        normalized = []
        for item in values:
            cleaned = item.strip()
            if not cleaned or cleaned.lower() in {"none", "healthy"}:
                continue
            normalized.append(cleaned.split("-")[0].strip())
        return normalized
    return [str(value)]

def _pick(payload: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in payload and payload[key] is not None:
            return payload[key]
    return default

def _risk_to_score(risk: Any) -> int:
    mapping = {"low": 20, "medium": 45, "high": 75, "critical": 95}
    return mapping.get(str(risk or "low").lower(), 0)

def build_telematics_log(payload: Dict[str, Any]) -> Dict[str, Any]:
    vehicle_id = _pick(payload, "vehicle_id", "vehicleId")
    if not vehicle_id:
        raise HTTPException(status_code=422, detail="vehicle_id is required")

    component_health = payload.get("componentHealth") or {}
    active_dtc_codes = normalize_dtc_codes(
        _pick(payload, "active_dtc_codes", "dtcCodes", "dtc_readable", "dtcReadable")
    )

    raw_record = {
        "vehicle_id": vehicle_id,
        "timestamp_utc": _pick(payload, "timestamp_utc", "timestamp", default=datetime.utcnow().isoformat()),
        "speed_kmh": _pick(payload, "speed_kmh", "speed"),
        "rpm": _pick(payload, "rpm"),
        "engine_temp_c": _pick(payload, "engine_temp_c", "engineTemperature", "engineTemp"),
        "oil_pressure_psi": _pick(payload, "oil_pressure_psi", "oilPressure", "oil_pressure"),
        "coolant_temp_c": _pick(payload, "coolant_temp_c", "coolantTemp"),
        "fuel_level_percent": _pick(payload, "fuel_level_percent", "fuelLevel"),
        "battery_voltage": _pick(payload, "battery_voltage", "batteryVoltage"),
        "latitude": _pick(payload, "latitude"),
        "longitude": _pick(payload, "longitude"),
        "altitude_m": _pick(payload, "altitude_m", "altitude"),
        "heading_degrees": _pick(payload, "heading_degrees", "heading"),
        "engine_torque_nm": _pick(payload, "engine_torque_nm", "engineTorque"),
        "engine_power_kw": _pick(payload, "engine_power_kw", "enginePower"),
        "throttle_position_percent": _pick(payload, "throttle_position_percent", "throttlePosition"),
        "brake_pressure_psi": _pick(payload, "brake_pressure_psi", "brakePosition"),
        "engine_health": _pick(component_health, "engine"),
        "transmission_health": _pick(component_health, "transmission"),
        "brake_health": _pick(component_health, "brakes"),
        "tire_health": _pick(component_health, "tires"),
        "battery_health": _pick(component_health, "battery"),
        "cooling_system_health": _pick(component_health, "cooling"),
        "exhaust_system_health": _pick(component_health, "exhaust"),
        "suspension_health": _pick(component_health, "suspension"),
        "active_dtc_codes": active_dtc_codes,
        "dtc_readable": ", ".join(active_dtc_codes) if active_dtc_codes else _pick(payload, "dtc_readable", "dtcReadable"),
        "vibration_level": _pick(payload, "vibration_level", "failureRisk", "maintenanceUrgency"),
        "noise_level": _pick(payload, "noise_level", "anomalyType"),
        "total_distance_km": _pick(payload, "total_distance_km", "totalDistanceKm"),
        "total_fuel_used_l": _pick(payload, "total_fuel_used_l", "totalFuelConsumed"),
        "total_operating_hours": _pick(payload, "total_operating_hours", "totalOperatingHours"),
        "anomaly_detected": bool(_pick(payload, "anomaly_detected", "anomalyDetected", default=False)),
        "risk_score": _risk_to_score(_pick(payload, "failureRisk", "risk_level", "maintenanceUrgency")),
        "raw_payload": payload,
    }

    if not raw_record["risk_score"]:
        assessment = calculate_risk_score(raw_record)
        raw_record["risk_score"] = assessment["score"]

    return raw_record


def _should_auto_analyze(vehicle_id: str, risk_score: int) -> bool:
    """Check if this vehicle warrants auto-analysis (high risk + cooldown passed)."""
    if risk_score < 40:
        return False
    now = datetime.utcnow().timestamp()
    last = _recent_auto_analyses.get(vehicle_id, 0)
    if now - last < AUTO_ANALYSIS_COOLDOWN:
        return False
    _recent_auto_analyses[vehicle_id] = now
    return True


def _run_auto_analysis(vehicle_id: str, telematics: Dict[str, Any]):
    """Run the full AI pipeline for a vehicle in background."""
    if not master_agent:
        return
    try:
        from app.api.routes_predictive import persist_analysis_outputs, PredictiveRequest

        initial_state = {
            "vehicle_id": vehicle_id,
            "vin": None,
            "vehicle_metadata": None,
            "telematics_data": telematics,
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
            "feedback_request": None,
        }

        result = master_agent.invoke(initial_state)

        # Persist results
        req = PredictiveRequest(
            vehicle_id=vehicle_id,
            engine_temp_c=int(telematics.get("engine_temp_c") or 90),
            oil_pressure_psi=float(telematics.get("oil_pressure_psi") or 40),
            rpm=int(telematics.get("rpm") or 1500),
            battery_voltage=float(telematics.get("battery_voltage") or 24),
            metadata={"source": "auto-trigger", "skip_telematics_persist": True},
        )
        persist_analysis_outputs(req, result)
        print(f"🤖 [Auto-Trigger] AI pipeline completed for {vehicle_id} | Risk: {result.get('risk_score')} | Booking: {result.get('booking_id')}")
    except Exception as e:
        print(f"❌ [Auto-Trigger] Failed for {vehicle_id}: {e}")
        traceback.print_exc()

@router.post("")
async def ingest_telematics(payload: Union[Dict[str, Any], List[Dict[str, Any]]]):
    records = payload if isinstance(payload, list) else [payload]
    inserted_vehicle_ids = []
    auto_triggered = []

    try:
        for record in records:
            db_payload = build_telematics_log(record)
            supabase.table("telematics_logs").insert(db_payload).execute()
            v_id = db_payload["vehicle_id"]
            inserted_vehicle_ids.append(v_id)

            # Auto-trigger AI pipeline for high-risk telemetry
            risk_score = db_payload.get("risk_score", 0)
            if _should_auto_analyze(v_id, risk_score):
                print(f"🔔 [Auto-Trigger] High risk ({risk_score}) for {v_id} — launching AI pipeline")
                _run_auto_analysis(v_id, db_payload)
                auto_triggered.append(v_id)

        return {
            "success": True,
            "count": len(inserted_vehicle_ids),
            "vehicle_ids": inserted_vehicle_ids,
            "auto_analyzed": auto_triggered,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error ingesting telemetry: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{vehicle_id}")
async def get_vehicle_stats(vehicle_id: str):
    """
    ENTERPRISE LOGIC: 
    1. Try Fetching Live Cloud Data (PostgreSQL)
    2. Fallback to Local Repository (Mock/Cache)
    3. Return Default Zeros
    """
    
    # 1. ✅ DATABASE ROUTE
    try:
        # Fetch the MOST RECENT log for this vehicle
        response = supabase.table("telematics_logs") \
            .select("*") \
            .eq("vehicle_id", vehicle_id) \
            .order("timestamp_utc", desc=True) \
            .limit(1) \
            .execute()

        if response["data"]:
            latest = response["data"][0]
            
            # Extract standard columns
            current_temp = latest.get("engine_temp_c", 0)
            current_oil = latest.get("oil_pressure_psi", 0.0)
            
            print(f"☁️ [Telematics] Serving DB Data for {vehicle_id}")

            return {
                "vehicle_id": vehicle_id,
                
                # Gauge Data
                "engine_temp": current_temp,       
                "engine_temp_c": current_temp,     
                "oil_pressure": current_oil,   
                "oil_pressure_psi": current_oil,
                "rpm": latest.get("rpm", 0),
                "battery_voltage": latest.get("battery_voltage", 0.0),
                "fuel_level": latest.get("fuel_level_percent", 0),
                
                # Diagnostics
                "dtc_readable": latest.get("active_dtc_codes", ["Healthy"])[0] 
                                if latest.get("active_dtc_codes") else "Healthy",
                
                "status": "Online (DB Sync)"
            }
            
    except Exception as e:
        print(f"⚠️ DB Fetch Error for {vehicle_id}: {e}")

    # 2. FALLBACK TO REPO (Mock Data)
    if TelematicsRepo:
        data = TelematicsRepo.get_latest_telematics(vehicle_id)
        if data:
            print(f"💾 [Telematics] Using Static Fallback for {vehicle_id}")
            return data

    # 3. IF TOTALLY MISSING
    return {
        "vehicle_id": vehicle_id,
        "engine_temp": 0,
        "oil_pressure": 0,
        "rpm": 0,
        "status": "No Connection"
    }