import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime
from database import supabase, execute_query

router = APIRouter()

# 1. Request Model
class BookingRequest(BaseModel):
    vehicle_id: str
    service_date: str  # YYYY-MM-DD
    notes: str

@router.post("/create")
async def create_booking(request: BookingRequest):
    """
    Creates a service booking in the database and updates vehicle status.
    """
    try:
        # Verify vehicle exists
        vehicle_resp = supabase.table("vehicles") \
            .select("vehicle_id") \
            .eq("vehicle_id", request.vehicle_id) \
            .execute()

        if not vehicle_resp["data"]:
            raise HTTPException(status_code=404, detail="Vehicle not found in database.")

        booking_id = f"BK-{uuid.uuid4().hex[:6].upper()}"
        scheduled_at = f"{request.service_date}T09:00:00"

        # Insert into service_bookings
        supabase.table("service_bookings").insert({
            "booking_id": booking_id,
            "vehicle_id": request.vehicle_id,
            "scheduled_date": scheduled_at,
            "service_type": request.notes or "Scheduled Maintenance",
            "status": "confirmed",
            "priority": "medium",
        }).execute()

        # Update vehicle status
        supabase.table("vehicles").update({
            "status": "scheduled",
            "next_service_date": scheduled_at,
        }).eq("vehicle_id", request.vehicle_id).execute()

        return {
            "status": "success",
            "booking_id": booking_id,
            "message": f"Service confirmed for {request.service_date}"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_bookings():
    """Returns all service bookings from the database."""
    try:
        rows = execute_query(
            "SELECT booking_id, vehicle_id, scheduled_date, status, priority, service_type "
            "FROM service_bookings ORDER BY scheduled_date DESC LIMIT 50",
            fetch=True,
        )
        return {"bookings": rows or []}
    except Exception as e:
        return {"bookings": [], "error": str(e)}