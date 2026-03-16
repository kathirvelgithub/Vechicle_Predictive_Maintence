from typing import Any, Dict, List, Optional


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _safe_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return fallback


def _normalize_dtc_codes(value: Any) -> List[str]:
    if value in (None, "", "None", "Healthy"):
        return []

    if isinstance(value, list):
        cleaned = [str(item).strip() for item in value if str(item).strip()]
        return list(dict.fromkeys(cleaned))

    if isinstance(value, str):
        parts = [part.strip() for part in value.split(",") if part.strip()]
        return list(dict.fromkeys(parts))

    cleaned = str(value).strip()
    return [cleaned] if cleaned else []


def _risk_level_from_score(score: int) -> str:
    if score >= 75:
        return "CRITICAL"
    if score >= 45:
        return "HIGH"
    if score >= 20:
        return "MEDIUM"
    return "LOW"


def _priority_from_risk_level(level: str) -> str:
    normalized = (level or "LOW").upper()
    if normalized == "CRITICAL":
        return "Critical"
    if normalized == "HIGH":
        return "High"
    if normalized == "MEDIUM":
        return "Medium"
    return "Low"


def _default_action(level: str) -> str:
    normalized = (level or "LOW").upper()
    if normalized == "CRITICAL":
        return "Stop vehicle operations immediately and dispatch emergency service support."
    if normalized == "HIGH":
        return "Schedule same-day workshop inspection and limit vehicle load."
    if normalized == "MEDIUM":
        return "Book preventive maintenance within 24-48 hours and continue monitored operation."
    return "Continue monitoring and follow routine maintenance schedule."


def _rule_reasons(temp_c: float, oil_psi: float, battery_v: float, rpm: int, dtc_codes: List[str]) -> List[str]:
    reasons: List[str] = []

    if temp_c >= 112:
        reasons.append(f"Critical overheating detected ({temp_c:.1f}C)")
    elif temp_c >= 102:
        reasons.append(f"Engine temperature elevated ({temp_c:.1f}C)")

    if oil_psi <= 16:
        reasons.append(f"Critical low oil pressure ({oil_psi:.1f} psi)")
    elif oil_psi <= 24:
        reasons.append(f"Low oil pressure ({oil_psi:.1f} psi)")

    if battery_v <= 11.6:
        reasons.append(f"Battery voltage critically low ({battery_v:.1f} V)")
    elif battery_v <= 12.1:
        reasons.append(f"Battery voltage below normal ({battery_v:.1f} V)")

    if rpm >= 4600:
        reasons.append(f"Sustained high RPM condition ({rpm})")

    if dtc_codes:
        reasons.append(f"Active DTC codes present ({', '.join(dtc_codes[:3])})")

    return reasons


def generate_rule_based_diagnosis(
    vehicle_id: str,
    telematics_data: Optional[Dict[str, Any]],
    detected_issues: Optional[List[str]] = None,
) -> Dict[str, Any]:
    telematics = dict(telematics_data or {})

    temp_c = _safe_float(telematics.get("engine_temp_c"), 0.0)
    oil_psi = _safe_float(telematics.get("oil_pressure_psi"), 0.0)
    battery_v = _safe_float(telematics.get("battery_voltage"), 24.0)
    rpm = _safe_int(telematics.get("rpm"), 0)

    dtc_codes = _normalize_dtc_codes(
        telematics.get("active_dtc_codes") or telematics.get("dtc_readable")
    )

    reasons = _rule_reasons(temp_c, oil_psi, battery_v, rpm, dtc_codes)

    if not reasons and detected_issues:
        reasons = [str(item).strip() for item in detected_issues if str(item).strip()]

    if not reasons:
        reasons = ["No critical anomalies detected from current telemetry."]

    score = 0
    if temp_c >= 112:
        score += 45
    elif temp_c >= 102:
        score += 20

    if oil_psi <= 16:
        score += 45
    elif oil_psi <= 24:
        score += 25

    if battery_v <= 11.6:
        score += 25
    elif battery_v <= 12.1:
        score += 10

    if rpm >= 4600:
        score += 10

    if dtc_codes:
        score += 20

    score = min(score, 100)
    risk_level = _risk_level_from_score(score)
    priority_level = _priority_from_risk_level(risk_level)
    recommended_action = _default_action(risk_level)

    primary_cause = reasons[0]

    immediate_actions = [
        recommended_action,
        "Capture a fresh telematics snapshot after 10 minutes and compare trend direction.",
    ]

    diagnosis_report = (
        f"### Issue Summary\n"
        f"- Vehicle: {vehicle_id}\n"
        f"- Key Findings: {'; '.join(reasons)}\n\n"
        f"### Root Cause Analysis\n"
        f"- Primary Cause: {primary_cause}\n"
        f"- Telemetry Inputs: Temp {temp_c:.1f}C, Oil {oil_psi:.1f} psi, Battery {battery_v:.1f} V, RPM {rpm}\n\n"
        f"### Immediate Action Plan\n"
        f"1. {immediate_actions[0]}\n"
        f"2. {immediate_actions[1]}\n\n"
        f"### Risk Assessment\n"
        f"- Severity: {risk_level}\n"
        f"- Risk Score: {score}"
    )

    return {
        "risk_score": score,
        "risk_level": risk_level,
        "priority_level": priority_level,
        "detected_issues": reasons,
        "recommended_action": recommended_action,
        "diagnosis_report": diagnosis_report,
    }
