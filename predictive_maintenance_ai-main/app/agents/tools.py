from app.data.repositories import TelematicsRepo, VehicleRepo
from app.ueba.middleware import secure_call
from datetime import datetime

def safe_tool_call(agent_name: str, service_name: str, func, *args, **kwargs):
    """
    Wraps a function call. If it fails UEBA check, returns a structured Blocked Event.
    """
    try:
        return secure_call(agent_name, service_name, func, *args, **kwargs)
    except PermissionError as e:
        # Return the alert object to be stored in state
        return {
            "agent": agent_name,
            "action": service_name,
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "message": "BLOCKED: Unauthorized Access Attempt",
            "blocked": True
        }

# --- TOOL DEFINITIONS ---

def fetch_telematics(vehicle_id: str, agent_name: str):
    return safe_tool_call(agent_name, "TelematicsRepo", TelematicsRepo.get_latest_telematics, vehicle_id)

def fetch_vehicle_data(vehicle_id: str, agent_name: str):
    return safe_tool_call(agent_name, "VehicleRepo", VehicleRepo.get_vehicle_details, vehicle_id)

def book_service_slot(vehicle_id: str, priority: str, agent_name: str):
    # Mock Booking Logic
    def _mock_book(vid, prio):
        return f"BK-{vid}-{prio[:3].upper()}-001"
    
    return safe_tool_call(agent_name, "SchedulerService", _mock_book, vehicle_id, priority)