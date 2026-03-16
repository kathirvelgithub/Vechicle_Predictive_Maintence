import pytest

from app.api import routes_telematics as rt
from app.api.routes_telematics import build_telematics_log, normalize_dtc_codes


def test_normalize_dtc_codes_handles_string_with_description():
    assert normalize_dtc_codes("P0217 - Engine Overheat") == ["P0217"]


def test_build_telematics_log_maps_simulation_payload():
    payload = {
        "vehicleId": "VEH-00001",
        "timestamp": "2026-03-08T10:00:00Z",
        "speed": 82,
        "rpm": 3100,
        "engineTemperature": 118,
        "oilPressure": 14.5,
        "batteryVoltage": 11.7,
        "latitude": 12.97,
        "longitude": 77.59,
        "componentHealth": {
            "engine": 44,
            "transmission": 72,
            "brakes": 80,
            "tires": 76,
            "battery": 60,
            "cooling": 41,
            "exhaust": 73,
            "suspension": 78,
        },
        "failureRisk": "critical",
        "anomalyDetected": True,
        "anomalyType": "low_oil_pressure",
    }

    row = build_telematics_log(payload)

    assert row["vehicle_id"] == "VEH-00001"
    assert row["engine_temp_c"] == 118
    assert row["oil_pressure_psi"] == 14.5
    assert row["battery_voltage"] == 11.7
    assert row["engine_health"] == 44
    assert row["cooling_system_health"] == 41
    assert row["risk_score"] == 95
    assert row["anomaly_detected"] is True


@pytest.mark.asyncio
async def test_ingest_telematics_broadcasts_even_when_insert_raises(monkeypatch):
    class _BrokenInsertTable:
        def insert(self, _payload):
            return self

        def execute(self):
            raise RuntimeError("db_down")

    class _BrokenSupabase:
        def table(self, _name):
            return _BrokenInsertTable()

    broadcast_topics = []

    async def _capture_broadcast(topic, _payload):
        broadcast_topics.append(topic)

    async def _enqueue_stub(**_kwargs):
        return False

    async def _stats_stub():
        return {"queued": 0}

    monkeypatch.setattr(rt, "supabase", _BrokenSupabase())
    monkeypatch.setattr(rt, "evaluate_telematics_anomaly", lambda _vehicle_id, _payload: {
        "risk_score": 68,
        "risk_level": "HIGH",
        "anomaly_level": "WATCH",
        "anomaly_detected": False,
        "reasons": ["synthetic-risk"],
    })
    monkeypatch.setattr(rt, "_upsert_vehicle_live_state", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(rt, "_persist_anomaly_event", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(rt.stream_manager, "broadcast", _capture_broadcast)
    monkeypatch.setattr(rt.escalation_queue, "enqueue", _enqueue_stub)
    monkeypatch.setattr(rt.escalation_queue, "stats", _stats_stub)

    response = await rt.ingest_telematics(
        {
            "vehicle_id": "V-301",
            "timestamp_utc": "2026-03-16T10:00:00Z",
            "engine_temp_c": 104,
            "oil_pressure_psi": 21,
            "rpm": 2900,
            "battery_voltage": 23.8,
        }
    )

    assert response["success"] is True
    assert response["count"] == 0
    assert response["failed_records"] == []
    assert any("insert exception" in warning for warning in response["warnings"])
    assert "telemetry.latest" in broadcast_topics