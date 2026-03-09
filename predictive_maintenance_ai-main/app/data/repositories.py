import json
import os
from app.domain.mapping import get_issue_description

# Helper to find the project root and the collected data file
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_FILE = os.path.join(BASE_DIR, "data_samples", "collected_data.json")

class TelematicsRepo:
    @staticmethod
    def get_latest_telematics(vehicle_id: str):
        """
        Reads the local JSON file (downloaded by loaders.py) 
        and finds the telematics for a specific vehicle.
        """
        if not os.path.exists(DATA_FILE):
            print("⚠️ Data file not found. Please run 'python app/data/loaders.py' first.")
            return None

        with open(DATA_FILE, "r") as f:
            data = json.load(f)
        
        # Navigate the new JSON structure: root -> vehicles -> vehicle_id
        vehicle_node = data.get("vehicles", {}).get(vehicle_id)
        if not vehicle_node:
            return None
        
        telematics = vehicle_node.get("telematics", {})
        
        # Enrich the raw codes with human-readable descriptions
        # (e.g., P0217 -> "Engine Coolant Over Temp")
        readable_codes = [
            f"{code}: {get_issue_description(code)}" 
            for code in telematics.get("active_dtc_codes", [])
        ]
        telematics["dtc_readable"] = readable_codes
        
        return telematics

class VehicleRepo:
    @staticmethod
    def get_vehicle_details(vehicle_id: str):
        """
        Reads static vehicle info (Model, Year, Owner) from the local file.
        """
        if not os.path.exists(DATA_FILE):
            return None
            
        with open(DATA_FILE, "r") as f:
            data = json.load(f)
            
        vehicle_node = data.get("vehicles", {}).get(vehicle_id)
        if not vehicle_node:
            return None
            
        # Return the 'metadata' section plus the ID
        info = vehicle_node.get("metadata", {})
        info["vehicle_id"] = vehicle_id
        return info