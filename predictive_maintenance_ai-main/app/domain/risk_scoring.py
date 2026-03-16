import os
from typing import Any, Dict, List

from app.domain.ml_risk_model import predict_ml_risk
from app.domain.risk_rules import calculate_risk_score


def _score_to_level(score: int) -> str:
    if score >= 75:
        return "CRITICAL"
    if score >= 40:
        return "HIGH"
    if score >= 20:
        return "MEDIUM"
    return "LOW"


def _safe_blend_weight() -> float:
    try:
        raw_value = float(os.getenv("ML_RISK_BLEND_WEIGHT", "0.7"))
    except ValueError:
        raw_value = 0.7
    return max(0.0, min(1.0, raw_value))


def _is_ml_enabled() -> bool:
    return os.getenv("ML_RISK_ENABLED", "true").strip().lower() != "false"


def _dedupe_reasons(reasons: List[str]) -> List[str]:
    seen = set()
    ordered: List[str] = []
    for item in reasons:
        cleaned = str(item).strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        ordered.append(cleaned)
    return ordered


def calculate_hybrid_risk_score(telematics_data: Dict[str, Any]) -> Dict[str, Any]:
    rule_assessment = calculate_risk_score(telematics_data)
    rule_score = int(rule_assessment.get("score", 0))
    rule_level = str(rule_assessment.get("level", "LOW")).upper()
    reasons = list(rule_assessment.get("reasons") or [])

    if not _is_ml_enabled():
        return {
            "score": rule_score,
            "level": rule_level,
            "reasons": _dedupe_reasons(reasons),
            "rule_score": rule_score,
            "rule_level": rule_level,
            "ml_score": None,
            "ml_available": False,
            "risk_model_used": "rules-only",
            "ml_reason": "disabled_by_env",
        }

    ml_result = predict_ml_risk(telematics_data)
    ml_score = ml_result.get("score") if ml_result.get("available") else None

    if ml_score is None:
        return {
            "score": rule_score,
            "level": rule_level,
            "reasons": _dedupe_reasons(reasons),
            "rule_score": rule_score,
            "rule_level": rule_level,
            "ml_score": None,
            "ml_available": False,
            "risk_model_used": "rules-only",
            "ml_reason": ml_result.get("reason"),
        }

    blend_weight = _safe_blend_weight()
    blended_score = int(round((blend_weight * int(ml_score)) + ((1.0 - blend_weight) * rule_score)))

    # Guardrail: never allow hybrid score to downplay rules-based risk.
    guarded_score = max(rule_score, blended_score)
    if rule_level == "CRITICAL":
        guarded_score = max(75, guarded_score)
    elif rule_level == "HIGH":
        guarded_score = max(40, guarded_score)

    final_score = max(0, min(100, guarded_score))
    final_level = _score_to_level(final_score)

    model_name = str(ml_result.get("model_name") or "xgboost-risk-model")
    reasons.append(f"ML calibrated risk estimate: {ml_score}/100 ({model_name})")

    return {
        "score": final_score,
        "level": final_level,
        "reasons": _dedupe_reasons(reasons),
        "rule_score": rule_score,
        "rule_level": rule_level,
        "ml_score": int(ml_score),
        "ml_available": True,
        "risk_model_used": model_name,
        "ml_reason": None,
    }
