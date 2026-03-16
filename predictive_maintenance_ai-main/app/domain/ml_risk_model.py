import os
import pickle
from pathlib import Path
from threading import Lock
from typing import Any, Dict, Optional


_MODEL_CACHE: Optional[Dict[str, Any]] = None
_MODEL_CACHE_LOCK = Lock()


def _default_model_path() -> Path:
    return Path(__file__).resolve().parents[1] / "models" / "risk_xgb.pkl"


def _resolve_model_path() -> Path:
    configured = os.getenv("ML_RISK_MODEL_PATH", "").strip()
    if not configured:
        return _default_model_path()

    path = Path(configured)
    if not path.is_absolute():
        project_root = Path(__file__).resolve().parents[2]
        path = project_root / path
    return path


def _safe_float(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _extract_features(telematics: Dict[str, Any]) -> list[list[float]]:
    rpm = _safe_float(telematics.get("rpm"), 0.0)
    oil_pressure_psi = _safe_float(telematics.get("oil_pressure_psi"), 40.0)
    engine_temp_c = _safe_float(telematics.get("engine_temp_c"), 85.0)
    coolant_temp_c = _safe_float(telematics.get("coolant_temp_c"), max(70.0, engine_temp_c - 3.0))
    temp_delta_c = engine_temp_c - coolant_temp_c

    return [[rpm, oil_pressure_psi, engine_temp_c, coolant_temp_c, temp_delta_c]]


def _load_model_bundle() -> Dict[str, Any]:
    global _MODEL_CACHE

    with _MODEL_CACHE_LOCK:
        if _MODEL_CACHE is not None:
            return _MODEL_CACHE

        model_path = _resolve_model_path()
        if not model_path.exists():
            _MODEL_CACHE = {
                "available": False,
                "reason": f"model_not_found:{model_path}",
            }
            return _MODEL_CACHE

        try:
            with model_path.open("rb") as file_obj:
                bundle = pickle.load(file_obj)
            bundle["available"] = True
            bundle["path"] = str(model_path)
            _MODEL_CACHE = bundle
        except Exception as exc:
            _MODEL_CACHE = {
                "available": False,
                "reason": f"model_load_failed:{exc.__class__.__name__}:{exc}",
            }

        return _MODEL_CACHE


def clear_model_cache() -> None:
    global _MODEL_CACHE
    with _MODEL_CACHE_LOCK:
        _MODEL_CACHE = None


def get_model_status() -> Dict[str, Any]:
    bundle = _load_model_bundle()
    status: Dict[str, Any] = {
        "available": bool(bundle.get("available")),
        "reason": bundle.get("reason"),
        "path": bundle.get("path") or str(_resolve_model_path()),
        "model_name": bundle.get("model_name") or "xgboost-risk-model",
    }
    return status


def predict_ml_risk(telematics: Dict[str, Any]) -> Dict[str, Any]:
    bundle = _load_model_bundle()
    if not bundle.get("available"):
        return {
            "available": False,
            "score": None,
            "probability": None,
            "model_name": "unavailable",
            "reason": bundle.get("reason", "unknown"),
        }

    model = bundle.get("model")
    calibrator = bundle.get("calibrator")
    if model is None:
        return {
            "available": False,
            "score": None,
            "probability": None,
            "model_name": "unavailable",
            "reason": "model_missing_in_bundle",
        }

    try:
        feature_matrix = _extract_features(telematics)
        raw_probability = float(model.predict_proba(feature_matrix)[0][1])

        calibrated_probability = raw_probability
        if calibrator is not None:
            calibrated_probability = float(calibrator.predict([raw_probability])[0])

        calibrated_probability = max(0.0, min(1.0, calibrated_probability))
        score = int(round(calibrated_probability * 100.0))

        model_name = str(bundle.get("model_name") or "xgboost-risk-model")
        return {
            "available": True,
            "score": score,
            "probability": calibrated_probability,
            "raw_probability": raw_probability,
            "model_name": model_name,
            "reason": None,
        }
    except Exception as exc:
        return {
            "available": False,
            "score": None,
            "probability": None,
            "model_name": str(bundle.get("model_name") or "xgboost-risk-model"),
            "reason": f"model_predict_failed:{exc.__class__.__name__}:{exc}",
        }
