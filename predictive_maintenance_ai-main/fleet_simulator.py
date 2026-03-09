import pandas as pd
import requests
import time
import random
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

def get_critical_payload(vehicle):
    """Generates ONLY Critical/Faulty data."""
    row = df.sample(n=1).iloc[0]
    
    # 🚨 FORCE CRITICAL VALUES
    engine_temp = random.randint(115, 125) # Overheating
    oil_psi = random.randint(5, 12)        # Low Pressure
    dtc = "P0217"                          # Overheating Code
    
    # Simulate 12V Battery for Cars (Low voltage fault < 12.0V)
    battery_voltage = round(random.uniform(11.2, 11.9), 1)

    return {
        "vehicle_id": vehicle["vehicle_id"],
        "metadata": { "model": vehicle["model"] },
        "engine_temp_c": engine_temp,
        "oil_pressure_psi": oil_psi,
        "rpm": int(row["Engine rpm"]),
        "battery_voltage": battery_voltage,
        "dtc_readable": dtc
    }

def send_request(vehicle):
    """Sends ONE request to the AI Backend."""
    try:
        data = get_critical_payload(vehicle)
        
        # Timeout = 60s to wait for AI Diagnosis
        response = requests.post(API_URL, json=data, timeout=60)
        
        print(f"🔥 {vehicle['vehicle_id']} (Critical) -> Status {response.status_code} | "
              f"Temp={data['engine_temp_c']}°C | "
              f"Oil={data['oil_pressure_psi']} PSI | "
              f"Batt={data['battery_voltage']}V")
        
    except requests.exceptions.Timeout:
        print(f"❌ {vehicle['vehicle_id']} Timed Out (AI took too long)")
    except Exception as e:
        print(f"❌ {vehicle['vehicle_id']} Failed: {e}")

# --- MAIN EXECUTION ---
if __name__ == "__main__":
    print(f"🚀 Initializing Virtual Fleet ({len(VIRTUAL_FLEET)} vehicles)...")
    print("ℹ️  Note: V-101 is excluded from this simulation.")
    start = time.time()

    # ⚡ EXECUTE IN PARALLEL
    with ThreadPoolExecutor(max_workers=len(VIRTUAL_FLEET)) as executor:
        executor.map(send_request, VIRTUAL_FLEET)

    print(f"✨ Critical Alerts processed in {time.time() - start:.2f} seconds.")