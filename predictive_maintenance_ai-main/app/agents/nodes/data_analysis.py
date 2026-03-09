from app.agents.state import AgentState
from app.domain.risk_rules import calculate_risk_score
from database import supabase # ✅ Direct DB Access

def _normalize_incoming_telematics(telematics_data: dict | None) -> dict:
    normalized = dict(telematics_data or {})
    dtc_readable = normalized.get("dtc_readable")
    active_codes = normalized.get("active_dtc_codes")

    if not active_codes and isinstance(dtc_readable, str):
        cleaned = dtc_readable.strip()
        if cleaned and cleaned.lower() not in {"none", "healthy"}:
            normalized["active_dtc_codes"] = [cleaned.split("-")[0].strip()]

    return normalized

def _has_live_telematics(telematics_data: dict | None) -> bool:
    if not telematics_data:
        return False

    tracked_fields = (
        "engine_temp_c",
        "oil_pressure_psi",
        "rpm",
        "battery_voltage",
        "dtc_readable",
        "active_dtc_codes",
    )
    return any(telematics_data.get(field) is not None for field in tracked_fields)

def data_analysis_node(state: AgentState) -> AgentState:
    v_id = state["vehicle_id"]
    print(f"🔍 [Analyzer] Querying Database for {v_id}...")

    try:
        # 1. FETCH METADATA (Vehicle Info + Owner from 'vehicles' table)
        # Owner data is stored directly in the vehicles table (owner_name, owner_phone)
        vehicle_response = supabase.table("vehicles") \
            .select("*") \
            .eq("vehicle_id", v_id) \
            .execute()

        if not vehicle_response["data"]:
            state["error_message"] = f"Vehicle {v_id} not found in DB."
            return state

        vehicle_data = vehicle_response["data"][0]
        
        # Map owner info from the vehicles table columns
        vehicle_data["owner"] = vehicle_data.get("owner_name", "Valued Customer")
        vehicle_data["phone"] = vehicle_data.get("owner_phone", "")

        state["vehicle_metadata"] = vehicle_data
        state["vin"] = vehicle_data.get("vin") # Critical for logs

        incoming_telematics = _normalize_incoming_telematics(state.get("telematics_data"))

        if _has_live_telematics(incoming_telematics):
            state["telematics_data"] = incoming_telematics
            risk_assessment = calculate_risk_score(incoming_telematics)

            state["risk_score"] = risk_assessment["score"]
            state["risk_level"] = risk_assessment["level"]
            state["detected_issues"] = risk_assessment["reasons"]
            return state

        # 2. FETCH TELEMATICS (Latest Sensor Data)
        telematics_response = supabase.table("telematics_logs") \
            .select("*") \
            .eq("vehicle_id", v_id) \
            .order("timestamp_utc", desc=True) \
            .limit(1) \
            .execute()

        if telematics_response["data"]:
            t_data = telematics_response["data"][0]
            state["telematics_data"] = t_data
            
            # 3. CALCULATE RISK (Using Live DB Data)
            risk_assessment = calculate_risk_score(t_data)
            
            state["risk_score"] = risk_assessment["score"]
            state["risk_level"] = risk_assessment["level"]
            state["detected_issues"] = risk_assessment["reasons"]
        else:
            # Fallback if vehicle exists but has no logs yet
            state["risk_score"] = 0
            state["risk_level"] = "LOW"
            state["detected_issues"] = ["No Data Available"]

        return state

    except Exception as e:
        print(f"❌ DB Connection Error: {e}")
        state["error_message"] = str(e)
        state["ueba_alert_triggered"] = True
        return state