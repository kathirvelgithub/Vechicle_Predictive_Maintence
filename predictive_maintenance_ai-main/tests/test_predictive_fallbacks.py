import pytest

from app.api import routes_predictive as rp
from app.api.routes_predictive import _ensure_diagnosis_result


def _telematics_payload():
    return {
        "engine_temp_c": 126,
        "oil_pressure_psi": 11.0,
        "rpm": 3900,
        "battery_voltage": 11.4,
        "active_dtc_codes": ["P0217"],
    }


def test_ensure_diagnosis_result_forces_rules_fallback_on_invalid_report():
    result = _ensure_diagnosis_result(
        result={
            "vehicle_id": "V-101",
            "risk_score": 0,
            "risk_level": "",
            "diagnosis_report": "Error generating diagnosis: RateLimitError",
            "node_statuses": {},
            "model_used_by_node": {},
        },
        vehicle_id="V-101",
        telematics_payload=_telematics_payload(),
    )

    assert result["diagnosis_source"] == "rules_fallback"
    assert result["node_statuses"]["diagnosis"] == "fallback_rules"
    assert result["model_used_by_node"]["diagnosis"] == "rules-fallback"
    assert result["fallback_reason"] == "diagnosis_report_invalid_or_empty"
    assert int(result["risk_score"]) > 0


def test_ensure_diagnosis_result_preserves_llm_source_when_metadata_exists():
    result = _ensure_diagnosis_result(
        result={
            "vehicle_id": "V-202",
            "risk_score": 82,
            "risk_level": "CRITICAL",
            "diagnosis_report": "### Risk\nSeverity: Critical\nProceed immediately.",
            "node_statuses": {"diagnosis": "ok"},
            "model_used_by_node": {"diagnosis": "groq:llama-3.3-70b-versatile"},
            "diagnosis_source": "llm",
        },
        vehicle_id="V-202",
        telematics_payload=_telematics_payload(),
    )

    assert result["diagnosis_source"] == "llm"
    assert result.get("fallback_reason") in (None, "")


def test_ensure_diagnosis_result_records_fallback_reason_when_provided():
    result = _ensure_diagnosis_result(
        result={
            "vehicle_id": "V-303",
            "diagnosis_report": "",
            "node_statuses": {},
            "model_used_by_node": {},
        },
        vehicle_id="V-303",
        telematics_payload=_telematics_payload(),
        fallback_reason="agent_invocation_failed:TimeoutError",
    )

    assert result["diagnosis_source"] == "rules_fallback"
    assert "TimeoutError" in (result.get("fallback_reason") or "")
    assert "TimeoutError" in (result.get("error_message") or "")


@pytest.mark.asyncio
async def test_predict_failure_uses_rules_when_master_agent_unavailable(monkeypatch):
    monkeypatch.setattr(rp, "master_agent", None)

    request = rp.PredictiveRequest(
        vehicle_id="V-404",
        engine_temp_c=124,
        oil_pressure_psi=12.0,
        rpm=3400,
        battery_voltage=11.5,
        dtc_readable="P0217-Engine Overheat",
        metadata={"source": "frontend_manual_diagnosis"},
    )

    response = await rp.predict_failure(request)

    assert response.vehicle_id == "V-404"
    assert response.risk_score > 0
    assert response.diagnosis_source == "rules_fallback"
    assert "master_agent_unavailable" in (response.fallback_reason or "")


@pytest.mark.asyncio
async def test_predict_failure_does_not_fail_when_stream_broadcast_errors(monkeypatch):
    class _FakeAgent:
        def invoke(self, state):
            return {
                **state,
                "vehicle_id": state["vehicle_id"],
                "risk_score": 72,
                "risk_level": "HIGH",
                "diagnosis_report": "### Risk\nSeverity: High\nImmediate inspection required.",
                "diagnosis_source": "llm",
                "fallback_reason": None,
                "node_statuses": {"diagnosis": "ok"},
                "model_used_by_node": {"diagnosis": "groq:llama-3.3-70b-versatile"},
            }

    async def _broken_broadcast(*_args, **_kwargs):
        raise RuntimeError("stream_down")

    monkeypatch.setattr(rp, "master_agent", _FakeAgent())
    monkeypatch.setattr(rp.stream_manager, "broadcast", _broken_broadcast)

    request = rp.PredictiveRequest(
        vehicle_id="V-405",
        engine_temp_c=108,
        oil_pressure_psi=18.0,
        rpm=3000,
        battery_voltage=12.2,
        dtc_readable="P0524-Low Oil Pressure",
        metadata={"source": "frontend_manual_diagnosis"},
    )

    response = await rp.predict_failure(request)

    assert response.vehicle_id == "V-405"
    assert response.risk_level == "HIGH"
    assert response.diagnosis_source == "llm"
