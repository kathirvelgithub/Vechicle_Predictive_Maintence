import os
import json

# Setup paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOCAL_STORAGE_PATH = os.path.join(BASE_DIR, "data_samples", "collected_data.json")

# WE EMBED THE DATA HERE TO GET YOU UNBLOCKED IMMEDIATELY
MOCK_ONLINE_DATA = {
  "fleet_id": "FL-9928-AX",
  "timestamp_utc": "2025-12-10T14:30:00Z",
  "vehicles": {
    "V-101": {
      "metadata": {
        "model": "HeavyHaul X5",
        "year": 2022,
        "engine_type": "Diesel-Hybrid",
        "owner": "Logistics Corp"
      },
      "telematics": {
        "engine_temp_c": 118,
        "oil_pressure_psi": 22,
        "rpm": 3400,
        "fuel_level_percent": 12,
        "battery_voltage": 23.4,
        "tire_pressure_bar": [7.1, 7.0, 6.8, 6.5],
        "active_dtc_codes": ["P0217", "P0524"],
        "gps_location": {"lat": 34.0522, "lon": -118.2437}
      },
      "maintenance_history": [
        {"date": "2025-08-10", "service": "Oil Change", "mileage": 45000},
        {"date": "2025-10-15", "service": "Brake Replacement", "mileage": 52000}
      ]
    },
    "V-102": {
      "metadata": {
        "model": "CityRunner Z1",
        "year": 2023,
        "engine_type": "Electric",
        "owner": "FastTrack Delivery"
      },
      "telematics": {
        "engine_temp_c": 65,
        "oil_pressure_psi": 45,
        "rpm": 0,
        "fuel_level_percent": 88,
        "battery_voltage": 48.1,
        "active_dtc_codes": []
      }
    }
  }
}

def collect_online_data():
    """
    Simulates fetching data and saving it to the local repository.
    """
    print(f"📡 Connecting to Telematics Cloud (Simulated)...")
    
    try:
        # Simulate download success
        data = MOCK_ONLINE_DATA
        fleet_id = data.get("fleet_id", "Unknown")
        vehicle_count = len(data.get("vehicles", {}))
        
        print(f"✅ Connection Successful. Fleet ID: {fleet_id}")
        print(f"📥 Downloading telemetry for {vehicle_count} vehicles...")

        # Store Data
        with open(LOCAL_STORAGE_PATH, "w") as f:
            json.dump(data, f, indent=2)
            
        print(f"💾 Data saved to: {LOCAL_STORAGE_PATH}")
        return True

    except Exception as e:
        print(f"❌ Error collecting data: {e}")
        return False

if __name__ == "__main__":
    collect_online_data()