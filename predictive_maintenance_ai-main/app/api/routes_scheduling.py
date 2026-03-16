import uuid
from datetime import datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.live_stream import stream_manager
from database import execute_query, supabase

router = APIRouter()

WORKDAY_START_HOUR = 9
WORKDAY_END_HOUR = 17
SLOT_STEP_MINUTES = 30
DEFAULT_APPROVER = "maintenance.manager@fleet.local"

_SCHEMA_INITIALIZED = False


class BookingRequest(BaseModel):
    vehicle_id: str
    service_date: str  # YYYY-MM-DD
    notes: str


class RecommendationCreateRequest(BaseModel):
    vehicle_id: str
    service_date: Optional[str] = None
    requested_start: Optional[str] = None
    notes: str = ""
    service_type: Optional[str] = None
    priority: str = "medium"
    risk_score: int = 0
    suggested_by: Optional[str] = None
    recipient: Optional[str] = None
    estimated_duration_hours: Optional[float] = Field(default=None, ge=0.5, le=8.0)


class RecommendationDecisionRequest(BaseModel):
    approver_email: Optional[str] = None
    notes: str = ""


def _normalize_priority(priority: Optional[str]) -> str:
    normalized = str(priority or "medium").strip().lower()
    if normalized in {"critical", "high", "medium", "low"}:
        return normalized
    if normalized in {"urgent", "severe"}:
        return "high"
    if normalized in {"routine", "normal"}:
        return "low"
    return "medium"


def _duration_from_request(request: RecommendationCreateRequest) -> float:
    if request.estimated_duration_hours is not None:
        return float(request.estimated_duration_hours)

    priority = _normalize_priority(request.priority)
    service_type = str(request.service_type or request.notes or "").lower()

    if "overhaul" in service_type:
        return 4.0
    if "critical" in service_type:
        return 3.0

    duration_by_priority = {
        "critical": 3.0,
        "high": 2.0,
        "medium": 1.5,
        "low": 1.0,
    }
    return duration_by_priority.get(priority, 1.5)


def _parse_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None

    raw = str(value).strip()
    if not raw:
        return None

    normalized = raw.replace(" ", "T").replace("Z", "+00:00")

    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        try:
            parsed = datetime.strptime(raw, "%Y-%m-%d")
        except ValueError:
            return None

    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _round_up_to_slot_step(candidate: datetime) -> datetime:
    aligned = candidate.replace(second=0, microsecond=0)
    remainder = aligned.minute % SLOT_STEP_MINUTES
    if remainder:
        aligned += timedelta(minutes=SLOT_STEP_MINUTES - remainder)
    return aligned


def _resolve_seed_datetime(request: RecommendationCreateRequest) -> datetime:
    if request.requested_start:
        requested = _parse_datetime(request.requested_start)
        if requested is not None:
            return _round_up_to_slot_step(requested)

    if request.service_date:
        parsed_date = _parse_datetime(request.service_date)
        if parsed_date is not None:
            start = datetime.combine(parsed_date.date(), time(hour=WORKDAY_START_HOUR, minute=0))
            return _round_up_to_slot_step(start)

    tomorrow = datetime.now() + timedelta(days=1)
    return datetime.combine(tomorrow.date(), time(hour=WORKDAY_START_HOUR, minute=0))


def _ensure_recommendation_schema() -> None:
    global _SCHEMA_INITIALIZED
    if _SCHEMA_INITIALIZED:
        return

    execute_query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"', fetch=False)

    execute_query(
        """
        CREATE TABLE IF NOT EXISTS service_recommendations (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            recommendation_id VARCHAR(50) UNIQUE NOT NULL,
            vehicle_id VARCHAR(50) NOT NULL,
            recommended_start TIMESTAMP NOT NULL,
            estimated_duration_hours DECIMAL(4, 2) NOT NULL DEFAULT 1.0,
            service_type VARCHAR(120),
            priority VARCHAR(20),
            risk_score INTEGER DEFAULT 0,
            reason TEXT,
            status VARCHAR(30) NOT NULL DEFAULT 'recommended',
            recipient VARCHAR(255),
            suggested_by VARCHAR(255),
            approver_email VARCHAR(255),
            approved_at TIMESTAMP,
            rejected_at TIMESTAMP,
            booking_id VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_recommendation_vehicle
                FOREIGN KEY (vehicle_id)
                REFERENCES vehicles(vehicle_id)
                ON DELETE CASCADE
        )
        """,
        fetch=False,
    )
    execute_query(
        "CREATE INDEX IF NOT EXISTS idx_recommendations_vehicle ON service_recommendations(vehicle_id)",
        fetch=False,
    )
    execute_query(
        "CREATE INDEX IF NOT EXISTS idx_recommendations_status ON service_recommendations(status)",
        fetch=False,
    )

    _SCHEMA_INITIALIZED = True


def _ensure_vehicle_exists(vehicle_id: str) -> None:
    result = supabase.table("vehicles").select("vehicle_id").eq("vehicle_id", vehicle_id).limit(1).execute()
    if result.get("error"):
        raise HTTPException(status_code=500, detail=str(result["error"]))
    if not result.get("data"):
        raise HTTPException(status_code=404, detail="Vehicle not found in database.")


def _serialize_row(row: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(row)
    for key in (
        "recommended_start",
        "approved_at",
        "rejected_at",
        "created_at",
        "updated_at",
        "scheduled_date",
    ):
        value = payload.get(key)
        if isinstance(value, datetime):
            payload[key] = value.isoformat()
    if payload.get("estimated_duration_hours") is not None:
        payload["estimated_duration_hours"] = float(payload["estimated_duration_hours"])
    if payload.get("risk_score") is None:
        payload["risk_score"] = 0
    return payload


def _find_overlapping_booking(start: datetime, duration_hours: float) -> Optional[Dict[str, Any]]:
    end = start + timedelta(hours=duration_hours)
    rows = execute_query(
        """
        SELECT booking_id, vehicle_id, scheduled_date, status,
               COALESCE(estimated_duration_hours, 1) AS estimated_duration_hours
        FROM service_bookings
        WHERE status NOT IN ('cancelled')
          AND scheduled_date < %s
          AND (scheduled_date + (COALESCE(estimated_duration_hours, 1) * interval '1 hour')) > %s
        ORDER BY scheduled_date ASC
        LIMIT 1
        """,
        (end, start),
        fetch=True,
    )
    if not rows:
        return None
    return _serialize_row(rows[0])


def _find_next_available_slot(seed: datetime, duration_hours: float, lookahead_days: int = 14) -> datetime:
    rounded_seed = _round_up_to_slot_step(seed)

    for day_offset in range(lookahead_days):
        current_date = (rounded_seed + timedelta(days=day_offset)).date()
        day_start = datetime.combine(current_date, time(hour=WORKDAY_START_HOUR, minute=0))
        day_end = datetime.combine(current_date, time(hour=WORKDAY_END_HOUR, minute=0))

        candidate = day_start
        if day_offset == 0 and rounded_seed > day_start:
            candidate = _round_up_to_slot_step(rounded_seed)

        latest_start = day_end - timedelta(hours=duration_hours)
        while candidate <= latest_start:
            if _find_overlapping_booking(candidate, duration_hours) is None:
                return candidate
            candidate += timedelta(minutes=SLOT_STEP_MINUTES)

    raise HTTPException(
        status_code=409,
        detail="No available slot found in the next 14 days for the requested duration.",
    )


def _insert_notification(
    vehicle_id: str,
    notification_type: str,
    title: str,
    message: str,
    recipient: Optional[str],
) -> Dict[str, Any]:
    result = (
        supabase.table("notifications")
        .insert(
            {
                "vehicle_id": vehicle_id,
                "notification_type": notification_type,
                "title": title,
                "message": message,
                "channel": "push",
                "recipient": recipient,
                "read": False,
                "acknowledged": False,
            }
        )
        .execute()
    )

    rows = result.get("data") or []
    if rows:
        return rows[0]

    return {
        "vehicle_id": vehicle_id,
        "notification_type": notification_type,
        "title": title,
        "message": message,
        "recipient": recipient,
    }


def _generate_recommendation_id() -> str:
    return f"RCM-{uuid.uuid4().hex[:8].upper()}"


def _generate_booking_id() -> str:
    return f"BK-{uuid.uuid4().hex[:8].upper()}"


@router.post("/create")
async def create_booking(request: BookingRequest):
    """
    Legacy booking endpoint kept for backward compatibility.
    """
    try:
        _ensure_vehicle_exists(request.vehicle_id)

        booking_id = _generate_booking_id()
        scheduled_at = f"{request.service_date}T09:00:00"

        supabase.table("service_bookings").insert(
            {
                "booking_id": booking_id,
                "vehicle_id": request.vehicle_id,
                "scheduled_date": scheduled_at,
                "service_type": request.notes or "Scheduled Maintenance",
                "status": "confirmed",
                "priority": "medium",
                "estimated_duration_hours": 1.0,
            }
        ).execute()

        supabase.table("vehicles").update(
            {
                "status": "scheduled",
                "next_service_date": scheduled_at,
            }
        ).eq("vehicle_id", request.vehicle_id).execute()

        await stream_manager.broadcast(
            "scheduling.booking.created",
            {
                "booking_id": booking_id,
                "vehicle_id": request.vehicle_id,
                "scheduled_date": scheduled_at,
                "source": "legacy-create-endpoint",
            },
        )

        return {
            "status": "success",
            "booking_id": booking_id,
            "message": f"Service confirmed for {request.service_date}",
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/list")
async def list_bookings():
    """Returns all service bookings from the database."""
    try:
        rows = execute_query(
            "SELECT booking_id, vehicle_id, scheduled_date, status, priority, service_type, "
            "COALESCE(estimated_duration_hours, 1) AS estimated_duration_hours "
            "FROM service_bookings ORDER BY scheduled_date DESC LIMIT 100",
            fetch=True,
        )
        return {"bookings": [_serialize_row(row) for row in (rows or [])]}
    except Exception as exc:
        return {"bookings": [], "error": str(exc)}


@router.post("/recommendations")
async def create_recommendation(request: RecommendationCreateRequest):
    """
    Generate a recommendation, send an approval alert, and return the pending approval item.
    """
    try:
        _ensure_recommendation_schema()
        _ensure_vehicle_exists(request.vehicle_id)

        duration_hours = _duration_from_request(request)
        seed = _resolve_seed_datetime(request)
        slot = _find_next_available_slot(seed, duration_hours)

        recommendation_id = _generate_recommendation_id()
        priority = _normalize_priority(request.priority)
        service_type = request.service_type or "repair"
        recipient = request.recipient or DEFAULT_APPROVER

        rows = execute_query(
            """
            INSERT INTO service_recommendations (
                recommendation_id,
                vehicle_id,
                recommended_start,
                estimated_duration_hours,
                service_type,
                priority,
                risk_score,
                reason,
                status,
                recipient,
                suggested_by
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'recommended', %s, %s)
            RETURNING recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                      service_type, priority, risk_score, reason, status, recipient, suggested_by,
                      created_at, updated_at
            """,
            (
                recommendation_id,
                request.vehicle_id,
                slot,
                duration_hours,
                service_type,
                priority,
                request.risk_score,
                request.notes or "Awaiting approval",
                recipient,
                request.suggested_by,
            ),
            fetch=True,
        )

        recommendation = _serialize_row(rows[0])
        notification = _insert_notification(
            vehicle_id=request.vehicle_id,
            notification_type="approval_required",
            title=f"Approval required for {request.vehicle_id}",
            message=(
                f"Recommendation {recommendation_id} needs approval for "
                f"{recommendation['recommended_start']} ({duration_hours}h)."
            ),
            recipient=recipient,
        )

        await stream_manager.broadcast(
            "scheduling.recommendation.created",
            {
                "recommendation": recommendation,
                "notification": notification,
            },
        )
        await stream_manager.broadcast(
            "notification.created",
            {
                "notification": notification,
                "source": "scheduling.recommendation",
            },
        )

        return {
            "status": "recommended",
            "recommendation": recommendation,
            "alert_sent": True,
            "notification": notification,
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/recommendations")
async def list_recommendations(status: Optional[str] = None, recipient: Optional[str] = None, limit: int = 50):
    try:
        _ensure_recommendation_schema()

        normalized_status = str(status or "").strip().lower()
        if not normalized_status:
            normalized_status = None

        rows = execute_query(
            """
            SELECT recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                   service_type, priority, risk_score, reason, status, recipient, suggested_by,
                   approver_email, approved_at, rejected_at, booking_id, created_at, updated_at
            FROM service_recommendations
            WHERE (%s IS NULL OR status = %s)
              AND (%s IS NULL OR recipient = %s)
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (normalized_status, normalized_status, recipient, recipient, max(1, min(limit, 200))),
            fetch=True,
        )
        return {"recommendations": [_serialize_row(row) for row in rows]}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/recommendations/pending")
async def list_pending_recommendations(recipient: Optional[str] = None, limit: int = 50):
    try:
        _ensure_recommendation_schema()

        rows = execute_query(
            """
            SELECT recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                   service_type, priority, risk_score, reason, status, recipient, suggested_by,
                   created_at, updated_at
            FROM service_recommendations
            WHERE status = 'recommended'
              AND (%s IS NULL OR recipient = %s)
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (recipient, recipient, max(1, min(limit, 200))),
            fetch=True,
        )

        return {"recommendations": [_serialize_row(row) for row in rows]}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/recommendations/{recommendation_id}/approve")
async def approve_recommendation(recommendation_id: str, decision: RecommendationDecisionRequest):
    try:
        _ensure_recommendation_schema()

        rows = execute_query(
            """
            SELECT recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                   service_type, priority, risk_score, reason, status, recipient, suggested_by,
                   approver_email, approved_at, booking_id, created_at, updated_at
            FROM service_recommendations
            WHERE recommendation_id = %s
            LIMIT 1
            """,
            (recommendation_id,),
            fetch=True,
        )

        if not rows:
            raise HTTPException(status_code=404, detail="Recommendation not found")

        recommendation = _serialize_row(rows[0])
        current_status = str(recommendation.get("status") or "").lower()

        if current_status == "booked":
            return {
                "status": "booked",
                "booking_id": recommendation.get("booking_id"),
                "recommendation": recommendation,
                "message": "Recommendation already approved and booked.",
            }

        if current_status != "recommended":
            return {
                "status": current_status or "unknown",
                "recommendation": recommendation,
                "message": f"Recommendation cannot be approved from status '{current_status}'.",
            }

        slot_start = _parse_datetime(str(recommendation.get("recommended_start")))
        if slot_start is None:
            raise HTTPException(status_code=500, detail="Recommendation has invalid slot timestamp")

        duration_hours = float(recommendation.get("estimated_duration_hours") or 1.0)
        conflict = _find_overlapping_booking(slot_start, duration_hours)

        approver_email = decision.approver_email or DEFAULT_APPROVER

        if conflict:
            alternative = _find_next_available_slot(slot_start + timedelta(minutes=SLOT_STEP_MINUTES), duration_hours)
            updated_rows = execute_query(
                """
                UPDATE service_recommendations
                SET status = 'conflict',
                    approver_email = %s,
                    updated_at = CURRENT_TIMESTAMP,
                    reason = %s
                WHERE recommendation_id = %s
                RETURNING recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                          service_type, priority, risk_score, reason, status, recipient, suggested_by,
                          approver_email, booking_id, updated_at
                """,
                (
                    approver_email,
                    f"Conflict with booking {conflict.get('booking_id')}. Re-approval required.",
                    recommendation_id,
                ),
                fetch=True,
            )

            updated = _serialize_row(updated_rows[0])
            await stream_manager.broadcast(
                "scheduling.recommendation.conflict",
                {
                    "recommendation": updated,
                    "conflict_booking": conflict,
                    "alternative_start": alternative.isoformat(),
                },
            )

            return {
                "status": "conflict",
                "recommendation": updated,
                "conflict_booking": conflict,
                "alternative_start": alternative.isoformat(),
                "message": "Slot is no longer available. Alternative generated.",
            }

        booking_id = _generate_booking_id()
        service_type = recommendation.get("service_type") or "repair"
        priority = _normalize_priority(str(recommendation.get("priority") or "medium"))

        execute_query(
            """
            INSERT INTO service_bookings (
                booking_id,
                vehicle_id,
                scheduled_date,
                service_type,
                estimated_duration_hours,
                status,
                priority,
                issues_to_address
            )
            VALUES (%s, %s, %s, %s, %s, 'confirmed', %s, %s)
            """,
            (
                booking_id,
                recommendation["vehicle_id"],
                slot_start,
                service_type,
                duration_hours,
                priority,
                [recommendation.get("reason") or decision.notes or "Approved from recommendation"],
            ),
            fetch=False,
        )

        execute_query(
            """
            UPDATE vehicles
            SET status = 'scheduled',
                next_service_date = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE vehicle_id = %s
            """,
            (slot_start, recommendation["vehicle_id"]),
            fetch=False,
        )

        updated_rows = execute_query(
            """
            UPDATE service_recommendations
            SET status = 'booked',
                approver_email = %s,
                approved_at = CURRENT_TIMESTAMP,
                booking_id = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE recommendation_id = %s
            RETURNING recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                      service_type, priority, risk_score, reason, status, recipient, suggested_by,
                      approver_email, approved_at, booking_id, updated_at
            """,
            (approver_email, booking_id, recommendation_id),
            fetch=True,
        )

        updated = _serialize_row(updated_rows[0])
        notification = _insert_notification(
            vehicle_id=updated["vehicle_id"],
            notification_type="booking_confirmed",
            title=f"Booking confirmed for {updated['vehicle_id']}",
            message=(
                f"Recommendation {recommendation_id} approved by {approver_email}. "
                f"Booking {booking_id} is confirmed for {updated['recommended_start']}."
            ),
            recipient=updated.get("recipient"),
        )

        await stream_manager.broadcast(
            "scheduling.recommendation.approved",
            {
                "recommendation": updated,
                "booking_id": booking_id,
                "notification": notification,
            },
        )
        await stream_manager.broadcast(
            "scheduling.booking.created",
            {
                "booking_id": booking_id,
                "vehicle_id": updated["vehicle_id"],
                "scheduled_date": updated["recommended_start"],
                "source": "recommendation.approval",
            },
        )

        return {
            "status": "booked",
            "booking_id": booking_id,
            "recommendation": updated,
            "notification": notification,
            "message": "Recommendation approved and booking created.",
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/recommendations/{recommendation_id}/reject")
async def reject_recommendation(recommendation_id: str, decision: RecommendationDecisionRequest):
    try:
        _ensure_recommendation_schema()

        rows = execute_query(
            """
            UPDATE service_recommendations
            SET status = 'rejected',
                approver_email = %s,
                rejected_at = CURRENT_TIMESTAMP,
                reason = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE recommendation_id = %s
              AND status = 'recommended'
            RETURNING recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                      service_type, priority, risk_score, reason, status, recipient, suggested_by,
                      approver_email, rejected_at, created_at, updated_at
            """,
            (
                decision.approver_email or DEFAULT_APPROVER,
                decision.notes or "Recommendation rejected by approver",
                recommendation_id,
            ),
            fetch=True,
        )

        if not rows:
            existing = execute_query(
                """
                SELECT recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                       service_type, priority, risk_score, reason, status, recipient, suggested_by,
                       approver_email, rejected_at, created_at, updated_at
                FROM service_recommendations
                WHERE recommendation_id = %s
                LIMIT 1
                """,
                (recommendation_id,),
                fetch=True,
            )
            if not existing:
                raise HTTPException(status_code=404, detail="Recommendation not found")
            return {
                "status": str(existing[0].get("status") or "unknown").lower(),
                "recommendation": _serialize_row(existing[0]),
                "message": "Recommendation is no longer pending and cannot be rejected.",
            }

        updated = _serialize_row(rows[0])
        notification = _insert_notification(
            vehicle_id=updated["vehicle_id"],
            notification_type="recommendation_rejected",
            title=f"Recommendation rejected for {updated['vehicle_id']}",
            message=f"Recommendation {recommendation_id} was rejected. {decision.notes or ''}".strip(),
            recipient=updated.get("recipient"),
        )

        await stream_manager.broadcast(
            "scheduling.recommendation.rejected",
            {
                "recommendation": updated,
                "notification": notification,
            },
        )

        return {
            "status": "rejected",
            "recommendation": updated,
            "notification": notification,
            "message": "Recommendation rejected.",
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
