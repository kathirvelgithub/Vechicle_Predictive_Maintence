from collections import defaultdict, deque
from datetime import datetime
from typing import Any, Deque, Dict, List, Optional, TypedDict

from app.domain.risk_scoring import calculate_hybrid_risk_score


class AnomalyAssessment(TypedDict):
    vehicle_id: str
    risk_score: int
    risk_level: str
    anomaly_level: str
    anomaly_detected: bool
    reasons: List[str]
    evaluated_at: str


_MAX_WINDOW = 6
_LEVEL_RANK = {"NORMAL": 0, "WATCH": 1, "HIGH": 2, "CRITICAL": 3}
_recent_samples: Dict[str, Deque[Dict[str, float]]] = defaultdict(lambda: deque(maxlen=_MAX_WINDOW))


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _promote_level(current: str, candidate: str) -> str:
    return candidate if _LEVEL_RANK.get(candidate, 0) > _LEVEL_RANK.get(current, 0) else current


def _map_risk_to_anomaly(risk_level: str) -> str:
    if risk_level in {"CRITICAL", "HIGH"}:
        return risk_level
    if risk_level == "MEDIUM":
        return "WATCH"
    return "NORMAL"


def evaluate_telematics_anomaly(vehicle_id: str, telematics: Dict[str, Any]) -> AnomalyAssessment:
    base_assessment = calculate_hybrid_risk_score(telematics)
    risk_score = int(base_assessment.get("score", 0))
    risk_level = str(base_assessment.get("level", "LOW")).upper()

    anomaly_level = _map_risk_to_anomaly(risk_level)
    reasons = list(base_assessment.get("reasons") or [])

    sample = {
        "engine_temp_c": _to_float(telematics.get("engine_temp_c")),
        "oil_pressure_psi": _to_float(telematics.get("oil_pressure_psi")),
        "rpm": _to_float(telematics.get("rpm")),
    }

    history = _recent_samples[vehicle_id]
    history.append(sample)

    if len(history) >= 3:
        latest_three = list(history)[-3:]

        temp_values = [entry["engine_temp_c"] for entry in latest_three if entry["engine_temp_c"] is not None]
        if len(temp_values) == 3 and (temp_values[-1] - temp_values[0]) >= 10.0:
            anomaly_level = _promote_level(anomaly_level, "HIGH")
            reasons.append("Rapid temperature rise in recent samples")

        oil_values = [entry["oil_pressure_psi"] for entry in latest_three if entry["oil_pressure_psi"] is not None]
        if len(oil_values) == 3 and all(value < 25.0 for value in oil_values):
            anomaly_level = _promote_level(anomaly_level, "HIGH")
            reasons.append("Sustained low oil pressure in recent samples")

    active_dtc_codes = telematics.get("active_dtc_codes") or []
    if isinstance(active_dtc_codes, str):
        active_dtc_codes = [code.strip() for code in active_dtc_codes.split(",") if code.strip()]

    if active_dtc_codes and anomaly_level == "NORMAL":
        anomaly_level = "WATCH"

    unique_reasons = []
    for reason in reasons:
        if reason not in unique_reasons:
            unique_reasons.append(reason)

    return {
        "vehicle_id": vehicle_id,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "anomaly_level": anomaly_level,
        "anomaly_detected": anomaly_level != "NORMAL",
        "reasons": unique_reasons,
        "evaluated_at": datetime.utcnow().isoformat(),
    }
