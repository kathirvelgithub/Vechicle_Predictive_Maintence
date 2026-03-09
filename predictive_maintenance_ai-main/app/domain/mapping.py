# app/domain/mapping.py

DTC_MAPPING = {
    "P0217": "Engine Coolant Over Temperature Condition",
    "P0524": "Engine Oil Pressure Too Low",
    "P0300": "Random/Multiple Cylinder Misfire Detected",
    "P0171": "System Too Lean (Bank 1)"
}

def get_issue_description(code: str) -> str:
    return DTC_MAPPING.get(code, "Unknown Diagnostic Trouble Code")