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