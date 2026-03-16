import uuid
import math
from fastapi import APIRouter, HTTPException
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from database import supabase  # ✅ DB Client

try:
    from app.api.routes_telematics import get_latest_manual_override
except Exception:
    def get_latest_manual_override(vehicle_id: str) -> Dict[str, Any]:
        return {
            "manual_override_active": False,
            "manual_override_keys": [],
            "manual_override_values": {},
        }

router = APIRouter()

# --- 1. DATA MODELS ---

class OwnerInfo(BaseModel):
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[str] = None

class BookingRequest(BaseModel):
    vehicle_id: str
    service_date: str
    notes: str

class VoiceLogEntry(BaseModel):
    role: str
    content: str

class VehicleSummary(BaseModel):
    vin: str
    model: str
    location: str
    telematics: str
    predictedFailure: str
    probability: int
    action: str
    scheduled_date: Optional[str] = None
    voice_transcript: Optional[List[VoiceLogEntry]] = None
    engine_temp: Optional[float] = 0.0
    oil_pressure: Optional[float] = 0.0
    battery_voltage: Optional[float] = 0.0
    manual_override_active: Optional[bool] = False
    manual_override_keys: Optional[List[str]] = None
    diagnosis_source: Optional[str] = None
    fallback_reason: Optional[str] = None
    
    # ✅ UPDATE: Added Owner Field (Nested Object)
    owners: Optional[OwnerInfo] = None 

class ActivityLog(BaseModel):
    id: str
    time: str
    agent: str 
    vehicle_id: str
    message: str
    type: str   # "info", "warning", "alert"

# --- 2. HELPER: GEOCODING ---
def resolve_location(lat, lon):
    if not lat or not lon: return "Unknown"
    try:
        lat = float(lat)
        lon = float(lon)
    except (ValueError, TypeError):
        return "Unknown"
    if 28.0 <= lat <= 29.0: return "Delhi, NCR"
    if 18.0 <= lat <= 20.0: return "Mumbai, MH"
    if 12.0 <= lat <= 13.5 and 77.0 <= lon <= 78.0: return "Bangalore, KA"
    if 12.0 <= lat <= 13.5 and 80.0 <= lon <= 81.0: return "Chennai, TN"
    if 10.5 <= lat <= 11.5: return "Coimbatore, TN" 
    if 9.5 <= lat <= 10.5: return "Madurai, TN"
    return f"{lat:.2f}, {lon:.2f}"


def _safe_number(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
        return number if math.isfinite(number) else default
    except (TypeError, ValueError):
        return default


def _round_metric(value: Any, default: float = 0.0, digits: int = 1) -> float:
    return round(_safe_number(value, default), digits)


def _safe_probability(value: Any) -> int:
    return int(round(_safe_number(value, 0.0)))


def _safe_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None

# --- 3. ENDPOINTS ---

@router.post("/create")
async def create_booking(request: BookingRequest):
    """
    Updates the 'vehicles' table directly.
    """
    try:
        booking_id = f"BK-{uuid.uuid4().hex[:6].upper()}"
        
        # Use vehicle_id column (VARCHAR), not id (UUID)
        response = supabase.table("vehicles").update({
            "status": "scheduled",
            "next_service_date": request.service_date,
        }).eq("vehicle_id", request.vehicle_id).execute()

        if not response["data"]:
            raise HTTPException(status_code=404, detail="Vehicle ID not found")

        return {
            "status": "success", 
            "booking_id": booking_id, 
            "message": f"Confirmed for {request.service_date}"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ DB Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status", response_model=List[VehicleSummary])
async def get_fleet_status():
    """
    Fetches vehicles and their latest telematics_logs for the fleet dashboard.
    """
    try:
        # 1. Get all vehicles (owner data is in the vehicles table itself)
        vehicles_response = supabase.table("vehicles") \
            .select("*") \
            .execute()
        
        summary_list = []

        for vehicle in vehicles_response["data"]:
            v_id = vehicle['vehicle_id']  # ✅ Fixed: use vehicle_id (VARCHAR)

            # 2. Prefer live-state for stream-first UI
            live_response = supabase.table("vehicle_live_state") \
                .select("*") \
                .eq("vehicle_id", v_id) \
                .limit(1) \
                .execute()
            latest_live = live_response["data"][0] if live_response["data"] else {}
            
            # 3. Fallback to latest log for additional fields like location/raw payload
            log_response = supabase.table("telematics_logs") \
                .select("*") \
                .eq("vehicle_id", v_id) \
                .order("timestamp_utc", desc=True) \
                .limit(1) \
                .execute()
            
            latest_log = log_response["data"][0] if log_response["data"] else {}
            latest_snapshot = latest_live or latest_log
            
            # Parse raw_payload safely
            raw_ai = latest_snapshot.get("raw_payload") or latest_log.get("raw_payload") or {}
            if isinstance(raw_ai, str):
                import json
                try:
                    raw_ai = json.loads(raw_ai)
                except (json.JSONDecodeError, TypeError):
                    raw_ai = {}
            
            # --- MAP DB COLUMNS ---
            temp = _round_metric(latest_snapshot.get("engine_temp_c"), 0.0)
            oil = _round_metric(latest_snapshot.get("oil_pressure_psi"), 0.0)
            batt = _round_metric(latest_snapshot.get("battery_voltage"), 0.0)
            
            # Issues
            db_dtcs = latest_snapshot.get("active_dtc_codes") or []
            failure = db_dtcs[0] if db_dtcs else "System Healthy"
            if failure == "System Healthy":
                ai_issues = raw_ai.get("detected_issues") or ["System Healthy"]
                failure = ai_issues[0] if ai_issues else "System Healthy"

            prob = latest_snapshot.get("risk_score", raw_ai.get("risk_score", 0))
            numeric_prob = _safe_number(prob, 0.0)
            
            # Status & Action
            db_status = vehicle.get("status", "active")
            s_date = vehicle.get("next_service_date")  # ✅ Fixed column name

            if db_status == "scheduled":
                action = "Service Booked"
            elif numeric_prob > 80:
                action = "Critical Alert"
            else:
                action = "Monitoring"
            
            # Location - use latitude/longitude columns ✅
            latitude = latest_log.get("latitude") if latest_log else None
            longitude = latest_log.get("longitude") if latest_log else None
            if (latitude is None or longitude is None) and isinstance(raw_ai, dict):
                latitude = raw_ai.get("latitude", latitude)
                longitude = raw_ai.get("longitude", longitude)

            real_location = resolve_location(
                latitude,
                longitude
            )

            # Transcripts
            transcript = None
            raw_transcript = raw_ai.get("voice_transcript")
            if raw_transcript and isinstance(raw_transcript, list):
                transcript = [
                    {"role": t.get("role", "assistant"), "content": t.get("content", "")} 
                    for t in raw_transcript
                ]
            
            # ✅ Extract Owner Data from vehicles table directly
            owner_data = OwnerInfo(
                full_name=vehicle.get("owner_name"),
                phone_number=vehicle.get("owner_phone"),
                email=vehicle.get("owner_email")
            )
            manual_override = get_latest_manual_override(v_id)

            summary_list.append(VehicleSummary(
                vin=v_id,
                model=vehicle.get("model", "Unknown Model"),    # ✅ Fixed: was model_name
                location=real_location,
                telematics="Live" if latest_snapshot else "Offline",
                predictedFailure=failure,
                probability=_safe_probability(prob),
                action=action,
                scheduled_date=str(s_date) if s_date else None,
                voice_transcript=transcript,
                engine_temp=temp,
                oil_pressure=oil,
                battery_voltage=batt,
                manual_override_active=manual_override.get("manual_override_active", False),
                manual_override_keys=manual_override.get("manual_override_keys", []),
                diagnosis_source=_safe_text(raw_ai.get("diagnosis_source")),
                fallback_reason=_safe_text(raw_ai.get("fallback_reason")),
                owners=owner_data
            ))
        
        return summary_list
    except Exception as e:
        print(f"❌ Error fetching fleet status: {e}")
        import traceback
        traceback.print_exc()
        return []

@router.get("/activity", response_model=List[ActivityLog])
async def get_agent_activity():
    """
    Reads from 'telematics_logs' for history.
    """
    try:
        response = supabase.table("telematics_logs") \
            .select("*") \
            .order("timestamp_utc", desc=True) \
            .limit(20) \
            .execute()

        activities = []
        for log in response["data"]:
            v_id = log["vehicle_id"]
            
            # Parse raw_payload safely
            raw = log.get("raw_payload") or {}
            if isinstance(raw, str):
                import json
                try:
                    raw = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    raw = {}
            
            ts = log.get("timestamp_utc", "Just now")
            log_id = log.get("id", "unknown")  # ✅ Fixed: was log_id
            
            # 1. Fault Detected
            if log.get("active_dtc_codes"):
                activities.append(ActivityLog(
                    id=f"{v_id}-diag-{log_id}",
                    time=str(ts), 
                    agent="Diagnosis Agent",
                    vehicle_id=v_id,
                    message=f"Identified issue: {log['active_dtc_codes'][0]}", 
                    type="info"
                ))

            # 2. High Risk
            risk = raw.get("risk_score", 0)
            if isinstance(risk, (int, float)) and risk > 50:
                activities.append(ActivityLog(
                    id=f"{v_id}-risk-{log_id}",
                    time=str(ts), 
                    agent="Risk Guardian",
                    vehicle_id=v_id,
                    message=f"Escalated high risk profile ({risk}%)",
                    type="alert" if risk > 80 else "warning"
                ))
            
            # 3. Booking Confirmation
            if raw.get("booking_id"):
                 activities.append(ActivityLog(
                    id=f"{v_id}-book-{log_id}",
                    time=str(ts), 
                    agent="Scheduling Agent",
                    vehicle_id=v_id,
                    message=f"Auto-Booking Confirmed: {raw.get('booking_id')}",
                    type="info"
                ))
        
        return activities
    except Exception as e:
        print(f"❌ Error fetching activity: {e}")
        import traceback
        traceback.print_exc()
        return []


@router.get("/dashboard")
async def get_fleet_dashboard():
    """
    Aggregated fleet dashboard showing latest AI analysis results per vehicle.
    """
    try:
        # Get all vehicles
        vehicles_resp = supabase.table("vehicles").select("*").execute()
        vehicles = vehicles_resp["data"] or []

        fleet_data = []
        for v in vehicles:
            v_id = v["vehicle_id"]

            # Get latest AI analysis
            ai_resp = supabase.table("ai_analysis_results") \
                .select("*") \
                .eq("vehicle_id", v_id) \
                .order("analysis_timestamp", desc=True) \
                .limit(1) \
                .execute()

            ai = ai_resp["data"][0] if ai_resp["data"] else {}

            # Get latest booking
            booking_resp = supabase.table("service_bookings") \
                .select("*") \
                .eq("vehicle_id", v_id) \
                .order("scheduled_date", desc=True) \
                .limit(1) \
                .execute()

            booking = booking_resp["data"][0] if booking_resp["data"] else {}

            # Get unread notification count
            notif_resp = supabase.table("notifications") \
                .select("*") \
                .eq("vehicle_id", v_id) \
                .execute()
            notif_count = len(notif_resp["data"]) if notif_resp["data"] else 0

            fleet_data.append({
                "vehicle_id": v_id,
                "model": v.get("model", "Unknown"),
                "status": v.get("status", "active"),
                "owner_name": v.get("owner_name"),
                "last_risk_score": v.get("last_risk_score", 0),
                "last_risk_level": v.get("last_risk_level", "LOW"),
                "last_analysis": v.get("last_analysis_timestamp"),
                "diagnosis_report": ai.get("diagnosis_report"),
                "priority_level": ai.get("priority_level"),
                "customer_script": ai.get("customer_script"),
                "booking_id": ai.get("booking_id") or booking.get("booking_id"),
                "scheduled_date": ai.get("scheduled_date") or booking.get("scheduled_date"),
                "manufacturing_insights": ai.get("manufacturing_recommendations"),
                "notification_count": notif_count,
            })

        return {"fleet": fleet_data, "total_vehicles": len(fleet_data)}
    except Exception as e:
        print(f"❌ Error fetching fleet dashboard: {e}")
        import traceback
        traceback.print_exc()
        return {"fleet": [], "total_vehicles": 0, "error": str(e)}