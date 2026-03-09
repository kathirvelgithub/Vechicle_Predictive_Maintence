"""
Simple Health Check and Test Routes
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from database import execute_query, db

router = APIRouter()

class SimpleTelemetry(BaseModel):
    vehicle_id: str
    engine_temp_c: Optional[float] = 0
    oil_pressure_psi: Optional[float] = 0
    rpm: Optional[int] = 0
    battery_voltage: Optional[float] = 0

@router.post("/simple-test")
async def simple_test(data: SimpleTelemetry):
    """
    Simple test endpoint that stores telemetry without AI processing
    """
    try:
        # Calculate simple risk score
        risk_score = 0
        issues = []
        
        if data.engine_temp_c > 110:
            risk_score += 40
            issues.append(f"High temperature: {data.engine_temp_c}°C")
        
        if data.oil_pressure_psi < 20:
            risk_score += 50
            issues.append(f"Low oil pressure: {data.oil_pressure_psi} PSI")
        
        if data.battery_voltage < 12.0:
            risk_score += 10
            issues.append(f"Low battery: {data.battery_voltage}V")
        
        # Determine risk level
        if risk_score >= 75:
            risk_level = "CRITICAL"
        elif risk_score >= 40:
            risk_level = "HIGH"
        elif risk_score >= 20:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"
        
        # Store in database
        try:
            db_data = {
                "vehicle_id": data.vehicle_id,
                "timestamp_utc": datetime.utcnow().isoformat(),
                "engine_temp_c": data.engine_temp_c,
                "oil_pressure_psi": data.oil_pressure_psi,
                "rpm": data.rpm,
                "battery_voltage": data.battery_voltage,
                "risk_score": risk_score
            }
            db.table("telematics_logs").insert(db_data).execute()
        except Exception as db_error:
            print(f"Database error: {db_error}")
        
        return {
            "success": True,
            "vehicle_id": data.vehicle_id,
            "risk_score": risk_score,
            "risk_level": risk_level,
            "detected_issues": issues,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.get("/vehicles")
async def get_vehicles():
    """Get all vehicles from database"""
    try:
        result = execute_query("SELECT * FROM vehicles ORDER BY created_at DESC LIMIT 10", fetch=True)
        return {"success": True, "count": len(result), "vehicles": result}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.get("/recent-telemetry")
async def get_recent_telemetry(vehicle_id: Optional[str] = None, limit: int = 10):
    """Get recent telemetry data"""
    try:
        if vehicle_id:
            query = f"SELECT * FROM telematics_logs WHERE vehicle_id = '{vehicle_id}' ORDER BY timestamp_utc DESC LIMIT {limit}"
        else:
            query = f"SELECT * FROM telematics_logs ORDER BY timestamp_utc DESC LIMIT {limit}"
        
        result = execute_query(query, fetch=True)
        return {"success": True, "count": len(result), "telemetry": result}
    except Exception as e:
        return {"success": False, "error": str(e)}
