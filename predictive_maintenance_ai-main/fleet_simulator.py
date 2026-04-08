import pandas as pd
import requests
import time
import random
import argparse
from concurrent.futures import ThreadPoolExecutor

# Configuration
API_URL = "http://localhost:8000/api/predictive/run"
CSV_FILE = "engine_data.csv"

# 1. Load Data
try:
    df = pd.read_csv(CSV_FILE)
    print(f"📂 Loaded {len(df)} rows from {CSV_FILE}")
except FileNotFoundError:
    print(f"❌ Error: {CSV_FILE} not found.")
    exit()

# 2. Define Fleet (EXCLUDING V-101)
# These IDs match your Frontend screenshot perfectly.
VIRTUAL_FLEET = [
    { "vehicle_id": "V-301", "model": "Mahindra XUV 3XO" },
    { "vehicle_id": "V-302", "model": "Mahindra Thar" },
    { "vehicle_id": "V-303", "model": "Mahindra Scorpio N" },
    { "vehicle_id": "V-304", "model": "Mahindra XUV700" },
    { "vehicle_id": "V-401", "model": "Honda City" },
    { "vehicle_id": "V-402", "model": "Honda Elevate" },
    { "vehicle_id": "V-403", "model": "Honda City Hybrid eHEV" }
]

VEHICLE_STATE = {
    vehicle["vehicle_id"]: {
        "engine_temp_c": random.uniform(86, 92),
        "oil_pressure_psi": random.uniform(34, 43),
        "battery_voltage": random.uniform(12.4, 12.9),
    }
    for vehicle in VIRTUAL_FLEET
}


def _clamp(value, low, high):
    return max(low, min(high, value))


def _pick_scenario(default_critical_bias: float):
    threshold = random.random()
    critical_bias = _clamp(default_critical_bias, 0.0, 0.9)
    watch_bias = 0.25
    normal_bias = 1.0 - critical_bias - watch_bias
    if normal_bias < 0.1:
        normal_bias = 0.1
        watch_bias = 0.9 - critical_bias

    if threshold < normal_bias:
        return "normal"
    if threshold < (normal_bias + watch_bias):
        return "watch"
    return "critical"


def _scenario_fault_code(scenario: str) -> str:
    if scenario == "critical":
        return random.choice(["P0217", "P0524", "P0562"])
    if scenario == "watch":
        return random.choice(["P0128", "P0171", "P0300", "None"])
    return "None"


def get_payload(vehicle, critical_bias: float):
    """Generate a realistic payload with temporal continuity per vehicle."""
    row = df.sample(n=1).iloc[0]
    scenario = _pick_scenario(critical_bias)

    state = VEHICLE_STATE[vehicle["vehicle_id"]]
    temp = state["engine_temp_c"]
    oil = state["oil_pressure_psi"]
    batt = state["battery_voltage"]

    if scenario == "normal":
        temp += random.uniform(-1.2, 1.5)
        oil += random.uniform(-1.2, 1.3)
        batt += random.uniform(-0.03, 0.03)
    elif scenario == "watch":
        temp += random.uniform(1.0, 3.5)
        oil += random.uniform(-2.6, -0.8)
        batt += random.uniform(-0.15, 0.0)
    else:
        temp += random.uniform(2.8, 6.0)
        oil += random.uniform(-4.2, -2.0)
        batt += random.uniform(-0.25, -0.05)

    temp = _clamp(temp, 78.0, 126.0)
    oil = _clamp(oil, 5.0, 48.0)
    batt = _clamp(batt, 11.1, 13.1)

    state["engine_temp_c"] = temp
    state["oil_pressure_psi"] = oil
    state["battery_voltage"] = batt

    dtc = _scenario_fault_code(scenario)

    return {
        "vehicle_id": vehicle["vehicle_id"],
        "engine_temp_c": int(round(temp)),
        "oil_pressure_psi": round(oil, 1),
        "rpm": int(row["Engine rpm"]),
        "battery_voltage": round(batt, 1),
        "dtc_readable": dtc,
        "metadata": {
            "model": vehicle["model"],
            "sim_scenario": scenario,
        },
    }

def send_request(vehicle, critical_bias: float):
    """Sends ONE request to the AI Backend."""
    try:
        data = get_payload(vehicle, critical_bias)
        
        # Timeout = 60s to wait for AI Diagnosis
        response = requests.post(API_URL, json=data, timeout=60)
        scenario = data.get("metadata", {}).get("sim_scenario", "normal")
        
        print(f"📡 {vehicle['vehicle_id']} ({scenario.upper()}) -> Status {response.status_code} | "
              f"Temp={data['engine_temp_c']}°C | "
              f"Oil={data['oil_pressure_psi']} PSI | "
              f"Batt={data['battery_voltage']}V")
        
    except requests.exceptions.Timeout:
        print(f"❌ {vehicle['vehicle_id']} Timed Out (AI took too long)")
    except Exception as e:
        print(f"❌ {vehicle['vehicle_id']} Failed: {e}")

# --- MAIN EXECUTION ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fleet telemetry simulator with controllable fault mix.")
    parser.add_argument("--rounds", type=int, default=1, help="Number of simulation rounds to run.")
    parser.add_argument(
        "--critical-bias",
        type=float,
        default=0.12,
        help="Probability bias for critical scenarios (0.0 to 0.9).",
    )
    parser.add_argument(
        "--between-rounds-sec",
        type=float,
        default=2.0,
        help="Delay between rounds in seconds.",
    )
    args = parser.parse_args()

    print(f"🚀 Initializing Virtual Fleet ({len(VIRTUAL_FLEET)} vehicles)...")
    print("ℹ️  Note: V-101 is excluded from this simulation.")
    print(
        f"ℹ️  Running {args.rounds} round(s), critical bias={args.critical_bias:.2f}, "
        f"delay={args.between_rounds_sec:.1f}s"
    )
    start = time.time()

    for round_number in range(1, max(1, args.rounds) + 1):
        print(f"\n--- Round {round_number} ---")
        with ThreadPoolExecutor(max_workers=len(VIRTUAL_FLEET)) as executor:
            futures = [executor.submit(send_request, vehicle, args.critical_bias) for vehicle in VIRTUAL_FLEET]
            for future in futures:
                future.result()

        if round_number < args.rounds and args.between_rounds_sec > 0:
            time.sleep(args.between_rounds_sec)

    print(f"✨ Simulation completed in {time.time() - start:.2f} seconds.")