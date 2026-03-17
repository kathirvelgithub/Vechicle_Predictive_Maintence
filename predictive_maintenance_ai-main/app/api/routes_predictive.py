import json
import traceback
from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from database import supabase  # ✅ DB Client
from app.services.live_stream import stream_manager
from app.domain.diagnosis_rules import generate_rule_based_diagnosis
from app.config.settings import is_email_confirmation_vehicle, is_sms_pilot_vehicle
from app.api.routes_scheduling import ensure_customer_confirmation_from_risk_event
from app.services.email_gateway import normalize_email, send_email
from app.services.sms_gateway import normalize_phone, send_sms

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
    diagnosis_source: Optional[str] = None
    fallback_reason: Optional[str] = None
    customer_script: Optional[str] = None
    booking_id: Optional[str] = None
    manufacturing_insights: Optional[str] = None
    ueba_alerts: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    run_id: Optional[str] = None
    orchestration_route: Optional[str] = None
    route_reason: Optional[str] = None
    execution_started_at: Optional[str] = None
    execution_finished_at: Optional[str] = None
    node_statuses: Optional[Dict[str, str]] = Field(default_factory=dict)
    node_latency_ms: Optional[Dict[str, int]] = Field(default_factory=dict)
    model_used_by_node: Optional[Dict[str, str]] = Field(default_factory=dict)

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


def _resolve_vehicle_contacts(vehicle_id: str, vehicle_metadata: Optional[Dict[str, Any]]) -> Dict[str, Optional[str]]:
    metadata = vehicle_metadata or {}
    owner_phone = normalize_phone(metadata.get("owner_phone"))
    owner_email = normalize_email(metadata.get("owner_email"))

    if owner_phone and owner_email:
        return {
            "owner_phone": owner_phone,
            "owner_email": owner_email,
        }

    try:
        rows = (
            supabase.table("vehicles")
            .select("owner_phone, owner_email")
            .eq("vehicle_id", vehicle_id)
            .limit(1)
            .execute()
            .get("data")
            or []
        )
    except Exception:
        rows = []

    if rows:
        db_row = rows[0] or {}
        if not owner_phone:
            owner_phone = normalize_phone(db_row.get("owner_phone"))
        if not owner_email:
            owner_email = normalize_email(db_row.get("owner_email"))

    return {
        "owner_phone": owner_phone,
        "owner_email": owner_email,
    }


def _derive_diagnosis_source(result: Dict[str, Any]) -> str:
    explicit_source = str(result.get("diagnosis_source") or "").strip().lower()
    if explicit_source in {"llm", "rules_fallback"}:
        return explicit_source

    node_status = str((result.get("node_statuses") or {}).get("diagnosis") or "").strip().lower()
    model_name = str((result.get("model_used_by_node") or {}).get("diagnosis") or "").strip().lower()
    diagnosis_text = str(result.get("diagnosis_report") or "").strip()

    if diagnosis_text and node_status == "ok" and model_name not in {"", "rules-fallback", "unknown"}:
        return "llm"

    return "rules_fallback"


def _ensure_diagnosis_result(
    result: Dict[str, Any],
    vehicle_id: str,
    telematics_payload: Dict[str, Any],
    fallback_reason: Optional[str] = None,
) -> Dict[str, Any]:
    safe_result = dict(result or {})

    def _is_invalid_diagnosis_report(text: Any) -> bool:
        if not isinstance(text, str):
            return True

        cleaned = text.strip()
        if not cleaned:
            return True

        lowered = cleaned.lower()
        failure_markers = (
            "error generating diagnosis",
            "llm invocation failed",
            "ratelimiterror",
            "rate limit reached",
            "rate_limit_exceeded",
        )
        return any(marker in lowered for marker in failure_markers)

    rule_output = generate_rule_based_diagnosis(
        vehicle_id=vehicle_id,
        telematics_data=safe_result.get("telematics_data") or telematics_payload,
        detected_issues=safe_result.get("detected_issues"),
    )

    safe_result["vehicle_id"] = safe_result.get("vehicle_id") or vehicle_id
    safe_result["telematics_data"] = safe_result.get("telematics_data") or telematics_payload

    if not safe_result.get("detected_issues"):
        safe_result["detected_issues"] = rule_output["detected_issues"]

    try:
        current_risk_score = int(float(safe_result.get("risk_score") or 0))
    except (TypeError, ValueError):
        current_risk_score = 0

    risk_score_replaced = False
    if current_risk_score <= 0:
        safe_result["risk_score"] = rule_output["risk_score"]
        risk_score_replaced = True

    current_risk_level = str(safe_result.get("risk_level") or "").strip().upper()
    if (
        not current_risk_level
        or (
            risk_score_replaced
            and current_risk_level == "LOW"
            and str(rule_output.get("risk_level") or "LOW").upper() != "LOW"
        )
    ):
        safe_result["risk_level"] = rule_output["risk_level"]

    current_priority = str(safe_result.get("priority_level") or "").strip()
    if (
        not current_priority
        or (
            risk_score_replaced
            and current_priority.lower() == "low"
            and str(rule_output.get("priority_level") or "Low").lower() != "low"
        )
    ):
        safe_result["priority_level"] = rule_output["priority_level"]

    if not str(safe_result.get("recommended_action") or "").strip() or safe_result.get("recommended_action") == "Wait":
        safe_result["recommended_action"] = rule_output["recommended_action"]

    used_rule_report = False
    if _is_invalid_diagnosis_report(safe_result.get("diagnosis_report")):
        safe_result["diagnosis_report"] = rule_output["diagnosis_report"]
        used_rule_report = True

    safe_result.setdefault("node_statuses", {})
    safe_result.setdefault("model_used_by_node", {})
    if used_rule_report:
        safe_result["node_statuses"]["diagnosis"] = "fallback_rules"
        safe_result["model_used_by_node"]["diagnosis"] = "rules-fallback"
    if not safe_result["node_statuses"].get("diagnosis"):
        safe_result["node_statuses"]["diagnosis"] = "ok" if not used_rule_report else "fallback_rules"
    if not safe_result["model_used_by_node"].get("diagnosis"):
        safe_result["model_used_by_node"]["diagnosis"] = "unknown" if not used_rule_report else "rules-fallback"

    if used_rule_report and not fallback_reason:
        fallback_reason = "diagnosis_report_invalid_or_empty"

    if not safe_result.get("orchestration_route"):
        safe_result["orchestration_route"] = "diagnosis_only"
    if not safe_result.get("route_reason"):
        safe_result["route_reason"] = "Rule-based diagnosis fallback"

    now_iso = datetime.now(timezone.utc).isoformat()
    if not safe_result.get("execution_started_at"):
        safe_result["execution_started_at"] = now_iso
    if not safe_result.get("execution_finished_at"):
        safe_result["execution_finished_at"] = now_iso

    if fallback_reason:
        previous_fallback_reason = str(safe_result.get("fallback_reason") or "").strip()
        if previous_fallback_reason:
            safe_result["fallback_reason"] = f"{previous_fallback_reason} | {fallback_reason}"
        else:
            safe_result["fallback_reason"] = fallback_reason

        previous_error = str(safe_result.get("error_message") or "").strip()
        if previous_error:
            safe_result["error_message"] = f"{previous_error} | {fallback_reason}"
        else:
            safe_result["error_message"] = fallback_reason

    safe_result["diagnosis_source"] = _derive_diagnosis_source(safe_result)
    if safe_result["diagnosis_source"] == "rules_fallback" and not safe_result.get("fallback_reason"):
        safe_result["fallback_reason"] = "rules_fallback_applied"

    return safe_result


def _build_telematics_payload(request: PredictiveRequest) -> Dict[str, Any]:
    payload = {
        "engine_temp_c": request.engine_temp_c,
        "oil_pressure_psi": request.oil_pressure_psi,
        "rpm": request.rpm,
        "battery_voltage": request.battery_voltage,
        "dtc_readable": request.dtc_readable,
    }

    if request.dtc_readable and request.dtc_readable not in {"None", "Healthy"}:
        payload["active_dtc_codes"] = [request.dtc_readable.split("-")[0].strip()]

    return payload


def _to_analyze_response(result: Dict[str, Any], request_vehicle_id: str) -> AnalyzeResponse:
    ueba_list = []
    if result.get("ueba_alert_triggered"):
        ueba_list.append({"message": "Anomalous telemetry pattern detected"})

    return AnalyzeResponse(
        vehicle_id=result.get("vehicle_id", request_vehicle_id),
        risk_score=result.get("risk_score", 0),
        risk_level=str(result.get("risk_level", "UNKNOWN")).upper(),
        diagnosis=result.get("diagnosis_report", "No diagnosis generated."),
        diagnosis_source=result.get("diagnosis_source"),
        fallback_reason=result.get("fallback_reason"),
        customer_script=result.get("customer_script"),
        booking_id=result.get("booking_id"),
        manufacturing_insights=result.get("manufacturing_recommendations"),
        ueba_alerts=ueba_list,
        run_id=result.get("run_id"),
        orchestration_route=result.get("orchestration_route"),
        route_reason=result.get("route_reason"),
        execution_started_at=result.get("execution_started_at"),
        execution_finished_at=result.get("execution_finished_at"),
        node_statuses=result.get("node_statuses", {}),
        node_latency_ms=result.get("node_latency_ms", {}),
        model_used_by_node=result.get("model_used_by_node", {}),
    )


def _build_failsafe_result(
    request: PredictiveRequest,
    fallback_reason: str,
    seed_result: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    telematics_payload = _build_telematics_payload(request)
    base_state = dict(seed_result or {})
    base_state.setdefault("vehicle_id", request.vehicle_id)
    base_state.setdefault("telematics_data", telematics_payload)
    base_state.setdefault("diagnosis_report", "")
    base_state.setdefault("risk_score", 0)
    base_state.setdefault("risk_level", "LOW")

    return _ensure_diagnosis_result(
        result=base_state,
        vehicle_id=request.vehicle_id,
        telematics_payload=telematics_payload,
        fallback_reason=fallback_reason,
    )

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

    if risk_level in {"HIGH", "CRITICAL"}:
        try:
            automation_reason = str(
                result.get("recommended_action")
                or result.get("diagnosis_report")
                or f"Automated {risk_level} risk event"
            )
            automation_outcome = ensure_customer_confirmation_from_risk_event(
                vehicle_id=request.vehicle_id,
                risk_score=int(result.get("risk_score") or 0),
                risk_level=risk_level,
                reason=automation_reason,
                suggested_by="predictive-high-risk-auto",
                recipient="maintenance.automation@fleet.local",
                approver_email="risk.automation@fleet.local",
            )
            safe_result["customer_confirmation_automation"] = automation_outcome
        except Exception as automation_error:
            print(f"⚠️ High-risk customer confirmation automation failed: {automation_error}")

    if result.get("customer_script"):
        vehicle_metadata = result.get("vehicle_metadata") or {}
        contacts = _resolve_vehicle_contacts(request.vehicle_id, vehicle_metadata)
        pilot_sms_target = contacts.get("owner_phone")
        pilot_email_target = contacts.get("owner_email")

        use_email_channel = bool(is_email_confirmation_vehicle(request.vehicle_id) and pilot_email_target)
        use_sms_channel = bool(not use_email_channel and is_sms_pilot_vehicle(request.vehicle_id) and pilot_sms_target)

        notification_channel = "email" if use_email_channel else ("sms" if use_sms_channel else ("voice" if result.get("audio_available") else "sms"))
        notification_recipient = (
            pilot_email_target
            if use_email_channel
            else (pilot_sms_target if use_sms_channel else (pilot_sms_target or pilot_email_target))
        )

        supabase.table("notifications").insert({
            "vehicle_id": request.vehicle_id,
            "notification_type": "critical" if risk_level == "CRITICAL" else "alert",
            "title": f"Maintenance alert for {request.vehicle_id}",
            "message": result.get("customer_script"),
            "channel": notification_channel,
            "recipient": notification_recipient,
        }).execute()

        if use_email_channel:
            send_email(
                pilot_email_target,
                f"Maintenance alert for {request.vehicle_id}",
                str(result.get("customer_script") or "Vehicle health alert. Please review and confirm service scheduling."),
            )
        elif use_sms_channel:
            send_sms(
                pilot_sms_target,
                str(result.get("customer_script") or "Vehicle health alert. Please review and confirm service scheduling."),
            )

# --- ENDPOINT ---
@router.post("/run", response_model=AnalyzeResponse)
async def predict_failure(request: PredictiveRequest):
    try:
        print(f"📡 [API] Received Analysis Request for: {request.vehicle_id}")

        metadata = request.metadata or {}
        trigger_source = str(metadata.get("source") or "frontend_manual_diagnosis")

        # 1. SETUP TELEMATICS
        telematics_payload = _build_telematics_payload(request)

        # 2. PREPARE STATE (Same as your mock logic)
        initial_state = {
            "run_id": "",
            "trigger_source": trigger_source,
            "orchestration_route": "",
            "route_reason": "",
            "execution_started_at": None,
            "execution_finished_at": None,
            "node_statuses": {},
            "node_latency_ms": {},
            "model_used_by_node": {},
            "vehicle_id": request.vehicle_id,
            "vin": None,
            "vehicle_metadata": metadata,
            "telematics_data": telematics_payload,
            "detected_issues": [],
            "risk_score": 0,
            "risk_level": "LOW",
            "rule_risk_score": None,
            "rule_risk_level": None,
            "ml_risk_score": None,
            "risk_model_used": None,
            "diagnosis_report": "",
            "diagnosis_source": None,
            "fallback_reason": None,
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

        # 3. RUN AGENT (or deterministic fallback if graph unavailable)
        if not master_agent:
            print("⚠️ master_agent unavailable, using rules fallback response")
            result = _build_failsafe_result(
                request=request,
                fallback_reason="master_agent_unavailable",
                seed_result=initial_state,
            )
        else:
            try:
                result = master_agent.invoke(initial_state)
            except Exception as agent_error:
                print(f"⚠️ Agent invocation failed, switching to rule fallback: {agent_error}")
                result = _build_failsafe_result(
                    request=request,
                    fallback_reason=f"agent_invocation_failed:{agent_error.__class__.__name__}",
                    seed_result=initial_state,
                )

            result = _ensure_diagnosis_result(
                result=result,
                vehicle_id=request.vehicle_id,
                telematics_payload=telematics_payload,
            )

        try:
            persist_analysis_outputs(request, result)
            print(f"☁️ [DB] Synced AI Analysis for {request.vehicle_id}")
            
        except Exception as db_err:
            print(f"⚠️ Warning: DB sync failed: {db_err}")

        try:
            await stream_manager.broadcast(
                "analysis.completed",
                {
                    "vehicle_id": result.get("vehicle_id", request.vehicle_id),
                    "risk_score": result.get("risk_score", 0),
                    "risk_level": str(result.get("risk_level", "LOW")).upper(),
                    "diagnosis": result.get("diagnosis_report"),
                    "diagnosis_source": result.get("diagnosis_source"),
                    "fallback_reason": result.get("fallback_reason"),
                    "recommended_action": result.get("recommended_action"),
                    "priority_level": result.get("priority_level"),
                    "booking_id": result.get("booking_id"),
                    "source": "manual-predictive-run",
                    "run_id": result.get("run_id"),
                    "orchestration_route": result.get("orchestration_route"),
                    "node_statuses": result.get("node_statuses", {}),
                    "model_used_by_node": result.get("model_used_by_node", {}),
                },
            )
        except Exception as stream_error:
            print(f"⚠️ Stream broadcast failed: {stream_error}")

        # 4. RETURN RESPONSE
        return _to_analyze_response(result, request.vehicle_id)

    except Exception as e:
        print(f"❌ Error in prediction endpoint: {e}")
        traceback.print_exc()
        fallback_result = _build_failsafe_result(
            request=request,
            fallback_reason=f"predictive_endpoint_failed:{e.__class__.__name__}",
        )
        return _to_analyze_response(fallback_result, request.vehicle_id)