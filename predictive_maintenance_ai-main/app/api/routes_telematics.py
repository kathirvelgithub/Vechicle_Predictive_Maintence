import asyncio
from datetime import datetime
from typing import Any, Dict, List, Union

from fastapi import APIRouter, HTTPException

from app.domain.risk_rules import calculate_risk_score
from app.services.anomaly_detector import evaluate_telematics_anomaly
from app.services.escalation_queue import escalation_queue
from app.services.live_stream import stream_manager
from database import supabase

try:
    from app.data.repositories import TelematicsRepo
except ImportError:
    TelematicsRepo = None


router = APIRouter()


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


def _normalize_timestamp(value: Any) -> str:
    if value is None:
        return datetime.utcnow().isoformat()

    if isinstance(value, (int, float)):
        seconds = float(value)
        if seconds > 10_000_000_000:
            seconds /= 1000.0
        try:
            return datetime.utcfromtimestamp(seconds).isoformat()
        except (ValueError, OSError):
            return datetime.utcnow().isoformat()

    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return datetime.utcnow().isoformat()
        try:
            return datetime.fromisoformat(cleaned.replace("Z", "+00:00")).isoformat()
        except ValueError:
            return cleaned

    return datetime.utcnow().isoformat()


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
        "timestamp_utc": _normalize_timestamp(_pick(payload, "timestamp_utc", "timestamp")),
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
    }

    if not raw_record["risk_score"]:
        assessment = calculate_risk_score(raw_record)
        raw_record["risk_score"] = assessment["score"]

    return raw_record


def _safe_risk_level(score: int) -> str:
    if score >= 75:
        return "CRITICAL"
    if score >= 40:
        return "HIGH"
    if score >= 20:
        return "MEDIUM"
    return "LOW"


def _stream_telematics_payload(record: Dict[str, Any], anomaly: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "vehicle_id": record.get("vehicle_id"),
        "timestamp_utc": record.get("timestamp_utc"),
        "engine_temp_c": record.get("engine_temp_c"),
        "oil_pressure_psi": record.get("oil_pressure_psi"),
        "rpm": record.get("rpm"),
        "battery_voltage": record.get("battery_voltage"),
        "risk_score": anomaly.get("risk_score", record.get("risk_score", 0)),
        "risk_level": anomaly.get("risk_level", _safe_risk_level(int(record.get("risk_score") or 0))),
        "anomaly_level": anomaly.get("anomaly_level", "NORMAL"),
        "anomaly_detected": bool(anomaly.get("anomaly_detected", False)),
    }


def _upsert_vehicle_live_state(record: Dict[str, Any], anomaly: Dict[str, Any]) -> None:
    payload = {
        "vehicle_id": record.get("vehicle_id"),
        "timestamp_utc": record.get("timestamp_utc"),
        "speed_kmh": record.get("speed_kmh"),
        "rpm": record.get("rpm"),
        "engine_temp_c": record.get("engine_temp_c"),
        "oil_pressure_psi": record.get("oil_pressure_psi"),
        "fuel_level_percent": record.get("fuel_level_percent"),
        "battery_voltage": record.get("battery_voltage"),
        "active_dtc_codes": record.get("active_dtc_codes"),
        "risk_score": anomaly.get("risk_score", record.get("risk_score", 0)),
        "risk_level": anomaly.get("risk_level", _safe_risk_level(int(record.get("risk_score") or 0))),
        "anomaly_level": anomaly.get("anomaly_level", "NORMAL"),
        "anomaly_detected": bool(anomaly.get("anomaly_detected", False)),
        "last_reasons": anomaly.get("reasons", []),
        "updated_at": datetime.utcnow().isoformat(),
    }

    try:
        updated = supabase.table("vehicle_live_state").update(payload).eq("vehicle_id", record["vehicle_id"]).execute()
        if updated.get("error"):
            raise RuntimeError(updated["error"])
        if not updated.get("data"):
            inserted = supabase.table("vehicle_live_state").insert(payload).execute()
            if inserted.get("error"):
                raise RuntimeError(inserted["error"])
    except Exception as exc:
        print(f"⚠️ vehicle_live_state upsert skipped: {exc}")


def _persist_anomaly_event(record: Dict[str, Any], anomaly: Dict[str, Any]) -> None:
    if not anomaly.get("anomaly_detected"):
        return

    payload = {
        "vehicle_id": record.get("vehicle_id"),
        "event_timestamp": record.get("timestamp_utc"),
        "anomaly_level": anomaly.get("anomaly_level", "WATCH"),
        "risk_score": anomaly.get("risk_score", record.get("risk_score", 0)),
        "risk_level": anomaly.get("risk_level", _safe_risk_level(int(record.get("risk_score") or 0))),
        "reasons": anomaly.get("reasons", []),
        "telematics_snapshot": record,
    }

    try:
        inserted = supabase.table("anomaly_events").insert(payload).execute()
        if inserted.get("error"):
            raise RuntimeError(inserted["error"])
    except Exception as exc:
        print(f"⚠️ anomaly event persist skipped: {exc}")


@router.post("")
async def ingest_telematics(payload: Union[Dict[str, Any], List[Dict[str, Any]]]):
    records = payload if isinstance(payload, list) else [payload]
    inserted_vehicle_ids: List[str] = []
    escalation_enqueued: List[str] = []
    anomaly_records: List[Dict[str, Any]] = []

    try:
        for record in records:
            db_payload = build_telematics_log(record)
            vehicle_id = db_payload["vehicle_id"]

            anomaly = await asyncio.to_thread(evaluate_telematics_anomaly, vehicle_id, db_payload)
            db_payload["risk_score"] = anomaly["risk_score"]
            db_payload["anomaly_detected"] = anomaly["anomaly_detected"]

            insert_result = await asyncio.to_thread(supabase.table("telematics_logs").insert(db_payload).execute)
            if insert_result.get("error"):
                raise RuntimeError(insert_result["error"])
            inserted_vehicle_ids.append(vehicle_id)

            await asyncio.to_thread(_upsert_vehicle_live_state, db_payload, anomaly)
            await asyncio.to_thread(_persist_anomaly_event, db_payload, anomaly)

            if anomaly["anomaly_detected"]:
                anomaly_records.append(
                    {
                        "vehicle_id": vehicle_id,
                        "anomaly_level": anomaly["anomaly_level"],
                        "risk_level": anomaly["risk_level"],
                    }
                )
                await stream_manager.broadcast(
                    "anomaly.event",
                    {
                        "vehicle_id": vehicle_id,
                        "anomaly_level": anomaly["anomaly_level"],
                        "risk_score": anomaly["risk_score"],
                        "risk_level": anomaly["risk_level"],
                        "reasons": anomaly["reasons"],
                    },
                )

            is_enqueued = await escalation_queue.enqueue(
                vehicle_id=vehicle_id,
                telematics=db_payload,
                anomaly_level=anomaly["anomaly_level"],
                reasons=anomaly["reasons"],
            )
            if is_enqueued:
                escalation_enqueued.append(vehicle_id)

            await stream_manager.broadcast("telemetry.latest", _stream_telematics_payload(db_payload, anomaly))

        queue_stats = await escalation_queue.stats()
        return {
            "success": True,
            "count": len(inserted_vehicle_ids),
            "vehicle_ids": inserted_vehicle_ids,
            "anomalies_detected": anomaly_records,
            "escalation_enqueued": escalation_enqueued,
            "queue_stats": queue_stats,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as exc:
        print(f"❌ Error ingesting telemetry: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

@router.get("/{vehicle_id}")
def get_vehicle_stats(vehicle_id: str):
    """
    ENTERPRISE LOGIC: 
    1. Try Fetching Live Cloud Data (PostgreSQL)
    2. Fallback to Local Repository (Mock/Cache)
    3. Return Default Zeros
    """
    
    # 1. Live state table (best for stream-driven UI)
    try:
        response = supabase.table("vehicle_live_state") \
            .select("*") \
            .eq("vehicle_id", vehicle_id) \
            .limit(1) \
            .execute()

        if response["data"]:
            latest = response["data"][0]
            current_temp = latest.get("engine_temp_c", 0)
            current_oil = latest.get("oil_pressure_psi", 0.0)
            print(f"☁️ [Telematics] Serving live-state data for {vehicle_id}")

            return {
                "vehicle_id": vehicle_id,

                "engine_temp": current_temp,
                "engine_temp_c": current_temp,
                "oil_pressure": current_oil,
                "oil_pressure_psi": current_oil,
                "rpm": latest.get("rpm", 0),
                "battery_voltage": latest.get("battery_voltage", 0.0),
                "fuel_level": latest.get("fuel_level_percent", 0),

                "dtc_readable": latest.get("active_dtc_codes", ["Healthy"])[0] 
                                if latest.get("active_dtc_codes") else "Healthy",

                "status": "Online (Live State)",
                "risk_score": latest.get("risk_score", 0),
                "risk_level": latest.get("risk_level", "LOW"),
                "anomaly_detected": latest.get("anomaly_detected", False),
            }

    except Exception as e:
        print(f"⚠️ Live state fetch error for {vehicle_id}: {e}")

    # 2. Latest telematics fallback
    try:
        response = supabase.table("telematics_logs") \
            .select("*") \
            .eq("vehicle_id", vehicle_id) \
            .order("timestamp_utc", desc=True) \
            .limit(1) \
            .execute()

        if response["data"]:
            latest = response["data"][0]
            current_temp = latest.get("engine_temp_c", 0)
            current_oil = latest.get("oil_pressure_psi", 0.0)
            print(f"☁️ [Telematics] Serving log fallback for {vehicle_id}")

            return {
                "vehicle_id": vehicle_id,
                "engine_temp": current_temp,
                "engine_temp_c": current_temp,
                "oil_pressure": current_oil,
                "oil_pressure_psi": current_oil,
                "rpm": latest.get("rpm", 0),
                "battery_voltage": latest.get("battery_voltage", 0.0),
                "fuel_level": latest.get("fuel_level_percent", 0),
                "dtc_readable": latest.get("active_dtc_codes", ["Healthy"])[0]
                                if latest.get("active_dtc_codes") else "Healthy",
                "status": "Online (DB Sync)",
                "risk_score": latest.get("risk_score", 0),
                "risk_level": _safe_risk_level(int(latest.get("risk_score") or 0)),
                "anomaly_detected": latest.get("anomaly_detected", False),
            }

    except Exception as e:
        print(f"⚠️ DB Fetch Error for {vehicle_id}: {e}")

    # 3. FALLBACK TO REPO (Mock Data)
    if TelematicsRepo:
        data = TelematicsRepo.get_latest_telematics(vehicle_id)
        if data:
            print(f"💾 [Telematics] Using Static Fallback for {vehicle_id}")
            return data

    # 4. IF TOTALLY MISSING
    return {
        "vehicle_id": vehicle_id,
        "engine_temp": 0,
        "oil_pressure": 0,
        "rpm": 0,
        "status": "No Connection"
    }