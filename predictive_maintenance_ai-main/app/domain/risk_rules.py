# app/domain/risk_rules.py

def calculate_risk_score(telematics_data: dict) -> dict:
    """
    Analyzes telematics data and returns a risk score (0-100) and level.
    """
    score = 0
    reasons = []

    # 1. Check Engine Temperature (Key: engine_temp_c)
    # Threshold: > 105C is bad
    temp = telematics_data.get("engine_temp_c", 0)
    if temp > 110:
        score += 40
        reasons.append(f"Critical Overheating ({temp}°C)")
    elif temp > 100:
        score += 20
        reasons.append(f"High Temperature ({temp}°C)")

    # 2. Check Oil Pressure (Key: oil_pressure_psi)
    # Threshold: < 30 psi is dangerous
    pressure = telematics_data.get("oil_pressure_psi", 100)
    if pressure < 20:
        score += 50
        reasons.append(f"Critical Low Oil Pressure ({pressure} psi)")
    elif pressure < 30:
        score += 25
        reasons.append(f"Low Oil Pressure ({pressure} psi)")

    # 3. Check DTC Codes (Key: active_dtc_codes)
    dtc_codes = telematics_data.get("active_dtc_codes", [])
    # Also check our enriched key if it exists
    if not dtc_codes:
        dtc_raw = telematics_data.get("dtc_readable", "")
        if isinstance(dtc_raw, list):
            dtc_codes = dtc_raw
        elif isinstance(dtc_raw, str) and dtc_raw.strip() and dtc_raw.strip().lower() not in ("none", "healthy"):
            dtc_codes = [dtc_raw.strip()]

    if dtc_codes:
        score += 30
        reasons.append(f"Active Fault Codes Detected: {len(dtc_codes)}")

    # Cap score at 100
    score = min(score, 100)

    # Determine Risk Level
    if score >= 75:
        level = "CRITICAL"
    elif score >= 40:
        level = "HIGH"
    elif score >= 20:
        level = "MEDIUM"
    else:
        level = "LOW"

    return {
        "score": score,
        "level": level,
        "reasons": reasons
    }