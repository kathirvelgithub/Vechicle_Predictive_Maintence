import traceback
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from database import supabase

router = APIRouter()

# --- Models ---
class NotificationCreate(BaseModel):
    vehicle_id: str
    notification_type: str = "info"  # alert, reminder, info, critical
    title: str
    message: str
    channel: str = "push"  # email, sms, push, voice
    recipient: Optional[str] = None

class NotificationOut(BaseModel):
    id: str
    vehicle_id: str
    notification_type: Optional[str] = None
    title: Optional[str] = None
    message: Optional[str] = None
    sent_at: Optional[str] = None
    channel: Optional[str] = None
    recipient: Optional[str] = None
    read: bool = False
    acknowledged: bool = False


# --- GET /notifications ---
@router.get("/", response_model=List[NotificationOut])
async def list_notifications(vehicle_id: Optional[str] = None, limit: int = 50):
    """List notifications, optionally filtered by vehicle_id."""
    try:
        query = supabase.table("notifications").select("*")
        if vehicle_id:
            query = query.eq("vehicle_id", vehicle_id)
        response = query.execute()
        rows = response["data"] if isinstance(response, dict) else []
        # Sort newest first and limit
        rows.sort(key=lambda r: r.get("sent_at", ""), reverse=True)
        return rows[:limit]
    except Exception as e:
        print(f"❌ Error listing notifications: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# --- POST /notifications ---
@router.post("/", response_model=NotificationOut)
async def create_notification(notif: NotificationCreate):
    """Create a new notification record."""
    try:
        row = {
            "vehicle_id": notif.vehicle_id,
            "notification_type": notif.notification_type,
            "title": notif.title,
            "message": notif.message,
            "channel": notif.channel,
            "recipient": notif.recipient,
        }
        result = supabase.table("notifications").insert(row)
        data = result["data"] if isinstance(result, dict) else result
        if isinstance(data, list) and len(data) > 0:
            return data[0]
        return {**row, "id": "pending", "read": False, "acknowledged": False}
    except Exception as e:
        print(f"❌ Error creating notification: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# --- PATCH /notifications/{notification_id}/read ---
@router.patch("/{notification_id}/read")
async def mark_notification_read(notification_id: str):
    """Mark a notification as read."""
    try:
        supabase.table("notifications").update({
            "read": True
        }).eq("id", notification_id).execute()
        return {"status": "ok", "id": notification_id, "read": True}
    except Exception as e:
        print(f"❌ Error marking notification read: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# --- PATCH /notifications/{notification_id}/acknowledge ---
@router.patch("/{notification_id}/acknowledge")
async def acknowledge_notification(notification_id: str):
    """Acknowledge a notification."""
    try:
        supabase.table("notifications").update({
            "acknowledged": True,
            "read": True,
        }).eq("id", notification_id).execute()
        return {"status": "ok", "id": notification_id, "acknowledged": True}
    except Exception as e:
        print(f"❌ Error acknowledging notification: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
