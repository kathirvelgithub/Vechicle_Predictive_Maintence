import uuid
import re
import secrets
import os
from datetime import datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.services.live_stream import stream_manager
from app.config.settings import (
    EMAIL_CONFIRMATION_BASE_URL,
    EMAIL_CONFIRMATION_TIMEOUT_MINUTES,
    SMS_CONFIRMATION_TIMEOUT_MINUTES,
    is_email_confirmation_vehicle,
    is_sms_pilot_vehicle,
)
from app.services.email_gateway import normalize_email, send_email
from app.services.sms_gateway import normalize_phone, send_sms
from database import execute_query, supabase

router = APIRouter()

WORKDAY_START_HOUR = 9
WORKDAY_END_HOUR = 17
SLOT_STEP_MINUTES = 30
DEFAULT_APPROVER = "maintenance.manager@fleet.local"
STATUS_PENDING_CUSTOMER_CONFIRMATION = "pending_customer_confirmation"
STATUS_CUSTOMER_DECLINED = "customer_declined"
SMS_REPLY_YES = {"YES", "Y", "CONFIRM", "BOOK"}
SMS_REPLY_NO = {"NO", "N", "DECLINE", "STOP"}
EMAIL_REPLY_YES = {"yes", "y", "confirm", "book"}
EMAIL_REPLY_NO = {"no", "n", "decline", "stop"}


def _read_positive_int_env(name: str, fallback: int) -> int:
    raw = str(os.getenv(name, fallback)).strip()
    try:
        parsed = int(raw)
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed > 0 else fallback


RISK_EVENT_REBOOK_GUARD_HOURS = _read_positive_int_env("RISK_EVENT_REBOOK_GUARD_HOURS", 168)

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


class CustomerSmsInboundRequest(BaseModel):
    recommendation_id: Optional[str] = None
    message: Optional[str] = None
    from_number: Optional[str] = None
    provider_message_id: Optional[str] = None
    idempotency_key: Optional[str] = None

    # Common provider callback aliases (for example Twilio)
    Body: Optional[str] = None
    From: Optional[str] = None
    MessageSid: Optional[str] = None


class CustomerEmailConfirmRequest(BaseModel):
    recommendation_id: str
    confirmation_code: str
    decision: str
    recipient_email: Optional[str] = None
    provider_message_id: Optional[str] = None
    idempotency_key: Optional[str] = None


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
    execute_query(
        "ALTER TABLE service_recommendations ADD COLUMN IF NOT EXISTS customer_confirmation_status VARCHAR(40)",
        fetch=False,
    )
    execute_query(
        "ALTER TABLE service_recommendations ADD COLUMN IF NOT EXISTS customer_confirmation_phone VARCHAR(30)",
        fetch=False,
    )
    execute_query(
        "ALTER TABLE service_recommendations ADD COLUMN IF NOT EXISTS customer_confirmation_requested_at TIMESTAMP",
        fetch=False,
    )
    execute_query(
        "ALTER TABLE service_recommendations ADD COLUMN IF NOT EXISTS customer_confirmation_confirmed_at TIMESTAMP",
        fetch=False,
    )
    execute_query(
        "ALTER TABLE service_recommendations ADD COLUMN IF NOT EXISTS customer_confirmation_declined_at TIMESTAMP",
        fetch=False,
    )
    execute_query(
        "ALTER TABLE service_recommendations ADD COLUMN IF NOT EXISTS customer_confirmation_reference VARCHAR(120)",
        fetch=False,
    )
    execute_query(
        "ALTER TABLE service_recommendations ADD COLUMN IF NOT EXISTS customer_confirmation_method VARCHAR(20)",
        fetch=False,
    )
    execute_query(
        "ALTER TABLE service_recommendations ADD COLUMN IF NOT EXISTS customer_confirmation_email VARCHAR(255)",
        fetch=False,
    )

    execute_query(
        """
        CREATE TABLE IF NOT EXISTS sms_confirmation_requests (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            recommendation_id VARCHAR(50) NOT NULL,
            vehicle_id VARCHAR(50) NOT NULL,
            phone_number VARCHAR(30) NOT NULL,
            confirmation_code VARCHAR(12) NOT NULL,
            decision_status VARCHAR(30) NOT NULL DEFAULT 'pending',
            provider_message_id VARCHAR(120),
            idempotency_key VARCHAR(120),
            requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            responded_at TIMESTAMP,
            response_text TEXT,
            last_error TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """,
        fetch=False,
    )
    execute_query(
        "CREATE INDEX IF NOT EXISTS idx_sms_confirmation_recommendation ON sms_confirmation_requests(recommendation_id)",
        fetch=False,
    )
    execute_query(
        "CREATE INDEX IF NOT EXISTS idx_sms_confirmation_status ON sms_confirmation_requests(decision_status)",
        fetch=False,
    )
    execute_query(
        """
        CREATE TABLE IF NOT EXISTS email_confirmation_requests (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            recommendation_id VARCHAR(50) NOT NULL,
            vehicle_id VARCHAR(50) NOT NULL,
            email_address VARCHAR(255) NOT NULL,
            confirmation_code VARCHAR(12) NOT NULL,
            decision_status VARCHAR(30) NOT NULL DEFAULT 'pending',
            provider_message_id VARCHAR(120),
            idempotency_key VARCHAR(120),
            requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            responded_at TIMESTAMP,
            response_text TEXT,
            last_error TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """,
        fetch=False,
    )
    execute_query(
        "CREATE INDEX IF NOT EXISTS idx_email_confirmation_recommendation ON email_confirmation_requests(recommendation_id)",
        fetch=False,
    )
    execute_query(
        "CREATE INDEX IF NOT EXISTS idx_email_confirmation_status ON email_confirmation_requests(decision_status)",
        fetch=False,
    )

    _SCHEMA_INITIALIZED = True


def _ensure_vehicle_exists(vehicle_id: str) -> None:
    result = supabase.table("vehicles").select("vehicle_id").eq("vehicle_id", vehicle_id).limit(1).execute()
    if result.get("error"):
        raise HTTPException(status_code=500, detail=str(result["error"]))
    if not result.get("data"):
        raise HTTPException(status_code=404, detail="Vehicle not found in database.")


def _is_pilot_vehicle(vehicle_id: str) -> bool:
    return is_sms_pilot_vehicle(str(vehicle_id or "").strip().upper())


def _is_email_confirmation_pilot(vehicle_id: str) -> bool:
    return is_email_confirmation_vehicle(str(vehicle_id or "").strip().upper())


def _get_owner_phone(vehicle_id: str) -> Optional[str]:
    result = (
        supabase.table("vehicles")
        .select("owner_phone")
        .eq("vehicle_id", vehicle_id)
        .limit(1)
        .execute()
    )
    rows = result.get("data") or []
    if not rows:
        return None
    normalized = normalize_phone(rows[0].get("owner_phone"))
    return normalized or None


def _get_owner_email(vehicle_id: str) -> Optional[str]:
    result = (
        supabase.table("vehicles")
        .select("owner_email")
        .eq("vehicle_id", vehicle_id)
        .limit(1)
        .execute()
    )
    rows = result.get("data") or []
    if not rows:
        return None
    normalized = normalize_email(rows[0].get("owner_email"))
    return normalized or None


def _build_email_confirmation_links(recommendation_id: str, confirmation_code: str) -> Dict[str, str]:
    base_url = str(EMAIL_CONFIRMATION_BASE_URL or "").strip() or "/api/scheduling/customer-confirmation/email"

    yes_query = urlencode(
        {
            "recommendation_id": recommendation_id,
            "confirmation_code": confirmation_code,
            "decision": "yes",
        }
    )
    no_query = urlencode(
        {
            "recommendation_id": recommendation_id,
            "confirmation_code": confirmation_code,
            "decision": "no",
        }
    )

    separator = "&" if "?" in base_url else "?"
    yes_url = f"{base_url}{separator}{yes_query}"
    no_url = f"{base_url}{separator}{no_query}"
    return {
        "yes_url": yes_url,
        "no_url": no_url,
    }


def _generate_confirmation_code() -> str:
    return str(secrets.randbelow(1000000)).zfill(6)


def _generate_confirmation_reference(recommendation_id: str) -> str:
    return f"{recommendation_id}-{uuid.uuid4().hex[:6].upper()}"


def _parse_sms_decision(message: str) -> Dict[str, Optional[str]]:
    raw = str(message or "").strip()
    tokens = [token for token in re.split(r"\s+", raw.upper()) if token]

    decision: Optional[str] = None
    recommendation_id: Optional[str] = None
    confirmation_code: Optional[str] = None

    for token in tokens:
        if decision is None and token in SMS_REPLY_YES:
            decision = "yes"
            continue
        if decision is None and token in SMS_REPLY_NO:
            decision = "no"
            continue
        if recommendation_id is None and re.fullmatch(r"RCM-[A-Z0-9]+", token):
            recommendation_id = token
            continue
        if confirmation_code is None and re.fullmatch(r"\d{4,8}", token):
            confirmation_code = token

    return {
        "decision": decision,
        "recommendation_id": recommendation_id,
        "confirmation_code": confirmation_code,
    }


def _normalize_customer_decision(raw_decision: str) -> Optional[str]:
    token = str(raw_decision or "").strip()
    if not token:
        return None

    upper = token.upper()
    lower = token.lower()
    if upper in SMS_REPLY_YES or lower in EMAIL_REPLY_YES:
        return "yes"
    if upper in SMS_REPLY_NO or lower in EMAIL_REPLY_NO:
        return "no"
    return None


def _create_sms_confirmation_request(
    recommendation_id: str,
    vehicle_id: str,
    phone_number: str,
    code: str,
    provider_message_id: Optional[str],
    last_error: Optional[str],
) -> Dict[str, Any]:
    expires_at = datetime.utcnow() + timedelta(minutes=SMS_CONFIRMATION_TIMEOUT_MINUTES)
    rows = execute_query(
        """
        INSERT INTO sms_confirmation_requests (
            recommendation_id,
            vehicle_id,
            phone_number,
            confirmation_code,
            decision_status,
            provider_message_id,
            requested_at,
            expires_at,
            last_error,
            updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, %s, %s, CURRENT_TIMESTAMP)
        RETURNING id, recommendation_id, vehicle_id, phone_number, confirmation_code,
                  decision_status, provider_message_id, idempotency_key, requested_at,
                  expires_at, responded_at, response_text, last_error
        """,
        (
            recommendation_id,
            vehicle_id,
            phone_number,
            code,
            "pending" if not last_error else "send_failed",
            provider_message_id,
            expires_at,
            last_error,
        ),
        fetch=True,
    )
    return _serialize_row(rows[0])


def _latest_confirmation_request(recommendation_id: str) -> Optional[Dict[str, Any]]:
    rows = execute_query(
        """
        SELECT id, recommendation_id, vehicle_id, phone_number, confirmation_code,
               decision_status, provider_message_id, idempotency_key, requested_at,
               expires_at, responded_at, response_text, last_error
        FROM sms_confirmation_requests
        WHERE recommendation_id = %s
        ORDER BY requested_at DESC
        LIMIT 1
        """,
        (recommendation_id,),
        fetch=True,
    )
    if not rows:
        return None
    return _serialize_row(rows[0])


def _update_confirmation_request(
    request_id: str,
    decision_status: str,
    response_text: str,
    provider_message_id: Optional[str],
    idempotency_key: Optional[str],
) -> None:
    execute_query(
        """
        UPDATE sms_confirmation_requests
        SET decision_status = %s,
            response_text = %s,
            provider_message_id = COALESCE(%s, provider_message_id),
            idempotency_key = COALESCE(%s, idempotency_key),
            responded_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = %s
        """,
        (
            decision_status,
            response_text,
            provider_message_id,
            idempotency_key,
            request_id,
        ),
        fetch=False,
    )


def _create_email_confirmation_request(
    recommendation_id: str,
    vehicle_id: str,
    email_address: str,
    code: str,
    provider_message_id: Optional[str],
    last_error: Optional[str],
) -> Dict[str, Any]:
    expires_at = datetime.utcnow() + timedelta(minutes=EMAIL_CONFIRMATION_TIMEOUT_MINUTES)
    rows = execute_query(
        """
        INSERT INTO email_confirmation_requests (
            recommendation_id,
            vehicle_id,
            email_address,
            confirmation_code,
            decision_status,
            provider_message_id,
            requested_at,
            expires_at,
            last_error,
            updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, %s, %s, CURRENT_TIMESTAMP)
        RETURNING id, recommendation_id, vehicle_id, email_address, confirmation_code,
                  decision_status, provider_message_id, idempotency_key, requested_at,
                  expires_at, responded_at, response_text, last_error
        """,
        (
            recommendation_id,
            vehicle_id,
            email_address,
            code,
            "pending" if not last_error else "send_failed",
            provider_message_id,
            expires_at,
            last_error,
        ),
        fetch=True,
    )
    return _serialize_row(rows[0])


def _latest_email_confirmation_request(recommendation_id: str) -> Optional[Dict[str, Any]]:
    rows = execute_query(
        """
        SELECT id, recommendation_id, vehicle_id, email_address, confirmation_code,
               decision_status, provider_message_id, idempotency_key, requested_at,
               expires_at, responded_at, response_text, last_error
        FROM email_confirmation_requests
        WHERE recommendation_id = %s
        ORDER BY requested_at DESC
        LIMIT 1
        """,
        (recommendation_id,),
        fetch=True,
    )
    if not rows:
        return None
    return _serialize_row(rows[0])


def _update_email_confirmation_request(
    request_id: str,
    decision_status: str,
    response_text: str,
    provider_message_id: Optional[str],
    idempotency_key: Optional[str],
) -> None:
    execute_query(
        """
        UPDATE email_confirmation_requests
        SET decision_status = %s,
            response_text = %s,
            provider_message_id = COALESCE(%s, provider_message_id),
            idempotency_key = COALESCE(%s, idempotency_key),
            responded_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = %s
        """,
        (
            decision_status,
            response_text,
            provider_message_id,
            idempotency_key,
            request_id,
        ),
        fetch=False,
    )


def _risk_priority_and_duration(risk_level: str) -> tuple[str, float]:
    normalized = str(risk_level or "").strip().upper()
    if normalized == "CRITICAL":
        return "critical", 3.0
    if normalized == "HIGH":
        return "high", 2.0
    return "medium", 1.5


def _active_recommendation_for_vehicle(vehicle_id: str) -> Optional[Dict[str, Any]]:
    rows = execute_query(
        """
        SELECT recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
               service_type, priority, risk_score, reason, status, recipient, suggested_by,
               approver_email, approved_at, booking_id,
               customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
               customer_confirmation_requested_at, customer_confirmation_confirmed_at,
               customer_confirmation_declined_at, customer_confirmation_reference,
               created_at, updated_at
        FROM service_recommendations
        WHERE vehicle_id = %s
          AND status IN ('recommended', %s, 'conflict')
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (vehicle_id, STATUS_PENDING_CUSTOMER_CONFIRMATION),
        fetch=True,
    )
    if not rows:
        return None
    return _serialize_row(rows[0])


def _recent_active_booking_for_vehicle(vehicle_id: str) -> Optional[Dict[str, Any]]:
    rows = execute_query(
        """
        SELECT booking_id, vehicle_id, scheduled_date, status, priority, service_type,
               COALESCE(estimated_duration_hours, 1) AS estimated_duration_hours
        FROM service_bookings
        WHERE vehicle_id = %s
          AND status NOT IN ('cancelled', 'completed')
          AND scheduled_date >= (CURRENT_TIMESTAMP - (%s * interval '1 hour'))
        ORDER BY scheduled_date DESC
        LIMIT 1
        """,
        (vehicle_id, RISK_EVENT_REBOOK_GUARD_HOURS),
        fetch=True,
    )
    if not rows:
        return None
    return _serialize_row(rows[0])


def _recent_booked_recommendation_for_vehicle(vehicle_id: str) -> Optional[Dict[str, Any]]:
    rows = execute_query(
        """
        SELECT recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
               service_type, priority, risk_score, reason, status, recipient, suggested_by,
               approver_email, approved_at, booking_id,
               customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
               customer_confirmation_requested_at, customer_confirmation_confirmed_at,
               customer_confirmation_declined_at, customer_confirmation_reference,
               created_at, updated_at
        FROM service_recommendations
        WHERE vehicle_id = %s
          AND status = 'booked'
          AND recommended_start >= (CURRENT_TIMESTAMP - (%s * interval '1 hour'))
        ORDER BY recommended_start DESC
        LIMIT 1
        """,
        (vehicle_id, RISK_EVENT_REBOOK_GUARD_HOURS),
        fetch=True,
    )
    if not rows:
        return None
    return _serialize_row(rows[0])


def _create_recommendation_from_risk(
    vehicle_id: str,
    risk_score: int,
    risk_level: str,
    reason: str,
    suggested_by: str,
    recipient: str,
) -> Dict[str, Any]:
    priority, duration_hours = _risk_priority_and_duration(risk_level)
    seed = datetime.combine((datetime.now() + timedelta(days=1)).date(), time(hour=WORKDAY_START_HOUR, minute=0))
    slot = _find_next_available_slot(seed, duration_hours)

    recommendation_id = _generate_recommendation_id()
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
                  customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                  customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                  customer_confirmation_declined_at, customer_confirmation_reference,
                  created_at, updated_at
        """,
        (
            recommendation_id,
            vehicle_id,
            slot,
            duration_hours,
            "repair",
            priority,
            int(risk_score or 0),
            str(reason or "").strip() or f"Automated {str(risk_level or '').upper()} risk alert from telemetry",
            recipient,
            suggested_by,
        ),
        fetch=True,
    )
    return _serialize_row(rows[0])


def _request_customer_email_confirmation(
    recommendation: Dict[str, Any],
    approver_email: str,
) -> Dict[str, Any]:
    recommendation_id = str(recommendation["recommendation_id"])
    vehicle_id = str(recommendation["vehicle_id"])

    owner_email = _get_owner_email(vehicle_id)
    if not owner_email:
        return {
            "status": "recommended",
            "recommendation": recommendation,
            "message": f"No owner_email found for {vehicle_id}; recommendation created for manual follow-up.",
        }

    confirmation_code = _generate_confirmation_code()
    confirmation_reference = _generate_confirmation_reference(recommendation_id)
    confirmation_links = _build_email_confirmation_links(recommendation_id, confirmation_code)

    email_subject = f"Service confirmation needed for {vehicle_id}"
    email_message = (
        f"Your vehicle {vehicle_id} has a high-risk service request at {recommendation['recommended_start']}.\n\n"
        f"To confirm booking, click YES: {confirmation_links['yes_url']}\n"
        f"To decline booking, click NO: {confirmation_links['no_url']}\n\n"
        f"Reference: {confirmation_reference}\n"
        f"Confirmation code: {confirmation_code}\n"
    )

    email_result = send_email(owner_email, email_subject, email_message)
    confirmation_request = _create_email_confirmation_request(
        recommendation_id=recommendation_id,
        vehicle_id=vehicle_id,
        email_address=owner_email,
        code=confirmation_code,
        provider_message_id=email_result.message_id,
        last_error=email_result.error,
    )

    updated_rows = execute_query(
        """
        UPDATE service_recommendations
        SET status = %s,
            approver_email = %s,
            approved_at = CURRENT_TIMESTAMP,
            customer_confirmation_status = %s,
            customer_confirmation_method = %s,
            customer_confirmation_email = %s,
            customer_confirmation_phone = NULL,
            customer_confirmation_requested_at = CURRENT_TIMESTAMP,
            customer_confirmation_reference = %s,
            updated_at = CURRENT_TIMESTAMP
        WHERE recommendation_id = %s
        RETURNING recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                  service_type, priority, risk_score, reason, status, recipient, suggested_by,
                  approver_email, approved_at, booking_id,
                  customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                  customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                  customer_confirmation_declined_at, customer_confirmation_reference,
                  created_at, updated_at
        """,
        (
            STATUS_PENDING_CUSTOMER_CONFIRMATION,
            approver_email,
            "pending" if email_result.ok else "send_failed",
            "email",
            owner_email,
            confirmation_reference,
            recommendation_id,
        ),
        fetch=True,
    )

    updated = _serialize_row(updated_rows[0])
    notification_message = (
        f"High-risk alert for {vehicle_id}. Waiting for customer email confirmation. "
        f"Reference: {confirmation_reference}."
    )
    if not email_result.ok:
        notification_message = (
            f"Email send failed for {recommendation_id}. Confirmation still pending. "
            f"Error: {email_result.error or 'unknown_error'}."
        )

    notification = _insert_notification(
        vehicle_id=vehicle_id,
        notification_type="booking_confirmation_requested",
        title=f"Customer confirmation needed for {vehicle_id}",
        message=notification_message,
        recipient=owner_email,
        channel="email",
    )

    return {
        "status": STATUS_PENDING_CUSTOMER_CONFIRMATION,
        "recommendation": updated,
        "notification": notification,
        "email_confirmation": {
            "status": "sent" if email_result.ok else "failed",
            "provider": email_result.provider,
            "provider_message_id": email_result.message_id,
            "reference": confirmation_reference,
            "requested_at": confirmation_request.get("requested_at"),
            "expires_at": confirmation_request.get("expires_at"),
            "error": email_result.error,
            "simulated": email_result.simulated,
        },
        "message": "High-risk recommendation created. Waiting for customer email confirmation.",
    }


def ensure_customer_confirmation_from_risk_event(
    vehicle_id: str,
    risk_score: int,
    risk_level: str,
    reason: str,
    suggested_by: str = "predictive-risk-auto",
    recipient: str = DEFAULT_APPROVER,
    approver_email: str = "risk.automation@fleet.local",
) -> Dict[str, Any]:
    """
    Create a recommendation from a high/critical risk event and request customer confirmation.
    Duplicate guard: one active recommendation per vehicle.
    """
    _ensure_recommendation_schema()
    _ensure_vehicle_exists(vehicle_id)

    existing = _active_recommendation_for_vehicle(vehicle_id)
    if existing:
        return {
            "status": "existing_active_request",
            "recommendation": existing,
            "message": "Active recommendation already exists for vehicle. Skipping duplicate creation.",
        }

    existing_booking = _recent_active_booking_for_vehicle(vehicle_id)
    if existing_booking:
        return {
            "status": "existing_active_booking",
            "booking": existing_booking,
            "message": (
                "Vehicle already has an active service booking in the guard window. "
                "Skipping duplicate recommendation."
            ),
        }

    recent_booked_recommendation = _recent_booked_recommendation_for_vehicle(vehicle_id)
    if recent_booked_recommendation:
        return {
            "status": "existing_booked_recommendation",
            "recommendation": recent_booked_recommendation,
            "message": (
                "Vehicle already has a recently booked recommendation in the guard window. "
                "Skipping duplicate recommendation."
            ),
        }

    recommendation = _create_recommendation_from_risk(
        vehicle_id=vehicle_id,
        risk_score=risk_score,
        risk_level=risk_level,
        reason=reason,
        suggested_by=suggested_by,
        recipient=recipient,
    )

    if _is_email_confirmation_pilot(vehicle_id):
        return _request_customer_email_confirmation(recommendation, approver_email)

    return {
        "status": "recommended",
        "recommendation": recommendation,
        "message": "Recommendation created, but email confirmation is not enabled for this vehicle.",
    }


def _serialize_row(row: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(row)
    for key in (
        "recommended_start",
        "approved_at",
        "rejected_at",
        "customer_confirmation_requested_at",
        "customer_confirmation_confirmed_at",
        "customer_confirmation_declined_at",
        "created_at",
        "updated_at",
        "scheduled_date",
        "requested_at",
        "expires_at",
        "responded_at",
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
    channel: str = "push",
) -> Dict[str, Any]:
    result = (
        supabase.table("notifications")
        .insert(
            {
                "vehicle_id": vehicle_id,
                "notification_type": notification_type,
                "title": title,
                "message": message,
                "channel": channel,
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
        "channel": channel,
        "recipient": recipient,
    }


def _generate_recommendation_id() -> str:
    return f"RCM-{uuid.uuid4().hex[:8].upper()}"


def _generate_booking_id() -> str:
    return f"BK-{uuid.uuid4().hex[:8].upper()}"


def _booking_exists(booking_id: Optional[str]) -> bool:
    value = str(booking_id or "").strip()
    if not value:
        return False

    rows = execute_query(
        """
        SELECT booking_id
        FROM service_bookings
        WHERE booking_id = %s
        LIMIT 1
        """,
        (value,),
        fetch=True,
    )
    return bool(rows)


def _ensure_booking_record_from_recommendation(
    recommendation: Dict[str, Any],
    reason: str,
    booking_id: Optional[str] = None,
) -> str:
    slot_start = _parse_datetime(str(recommendation.get("recommended_start")))
    if slot_start is None:
        raise HTTPException(status_code=500, detail="Recommendation has invalid slot timestamp")

    duration_hours = float(recommendation.get("estimated_duration_hours") or 1.0)
    service_type = recommendation.get("service_type") or "repair"
    priority = _normalize_priority(str(recommendation.get("priority") or "medium"))
    resolved_booking_id = str(booking_id or "").strip() or _generate_booking_id()

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
        ON CONFLICT (booking_id) DO UPDATE
        SET vehicle_id = EXCLUDED.vehicle_id,
            scheduled_date = EXCLUDED.scheduled_date,
            service_type = EXCLUDED.service_type,
            estimated_duration_hours = EXCLUDED.estimated_duration_hours,
            status = EXCLUDED.status,
            priority = EXCLUDED.priority,
            issues_to_address = EXCLUDED.issues_to_address,
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            resolved_booking_id,
            recommendation["vehicle_id"],
            slot_start,
            service_type,
            duration_hours,
            priority,
            [reason],
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

    return resolved_booking_id


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
async def list_bookings(
    limit: int = 500,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
):
    """Returns service bookings with optional date-window filtering."""
    try:
        normalized_limit = max(50, min(limit, 2000))
        where_clauses: List[str] = []
        params: List[Any] = []

        if from_date:
            parsed_from = _parse_datetime(from_date)
            if parsed_from is None:
                raise HTTPException(status_code=400, detail="Invalid from_date format")
            where_clauses.append("scheduled_date >= %s")
            params.append(parsed_from)

        if to_date:
            parsed_to = _parse_datetime(to_date)
            if parsed_to is None:
                raise HTTPException(status_code=400, detail="Invalid to_date format")
            where_clauses.append("scheduled_date <= %s")
            params.append(parsed_to)

        where_sql = ""
        if where_clauses:
            where_sql = " WHERE " + " AND ".join(where_clauses)

        rows = execute_query(
            "SELECT booking_id, vehicle_id, scheduled_date, status, priority, service_type, "
            "COALESCE(estimated_duration_hours, 1) AS estimated_duration_hours "
            f"FROM service_bookings{where_sql} ORDER BY scheduled_date ASC LIMIT %s",
            tuple(params + [normalized_limit]),
            fetch=True,
        )
        return {"bookings": [_serialize_row(row) for row in (rows or [])]}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


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
                      customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                      customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                      customer_confirmation_declined_at, customer_confirmation_reference,
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
                     approver_email, approved_at, rejected_at, booking_id,
                                         customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                     customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                     customer_confirmation_declined_at, customer_confirmation_reference,
                     created_at, updated_at
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
                                         customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                     customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                     customer_confirmation_declined_at, customer_confirmation_reference,
                     created_at, updated_at
            FROM service_recommendations
                  WHERE status IN ('recommended', %s)
              AND (%s IS NULL OR recipient = %s)
            ORDER BY created_at DESC
            LIMIT %s
            """,
                  (STATUS_PENDING_CUSTOMER_CONFIRMATION, recipient, recipient, max(1, min(limit, 200))),
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
                     approver_email, approved_at, booking_id,
                                         customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                     customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                     customer_confirmation_declined_at, customer_confirmation_reference,
                     created_at, updated_at
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

        if current_status == STATUS_PENDING_CUSTOMER_CONFIRMATION:
            return {
                "status": STATUS_PENDING_CUSTOMER_CONFIRMATION,
                "booking_id": recommendation.get("booking_id"),
                "recommendation": recommendation,
                "message": "Recommendation is waiting for customer confirmation.",
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
                          approver_email, booking_id,
                          customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                          customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                          customer_confirmation_declined_at, customer_confirmation_reference,
                          created_at, updated_at
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

        if _is_email_confirmation_pilot(recommendation["vehicle_id"]):
            owner_email = _get_owner_email(recommendation["vehicle_id"])
            if not owner_email:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Pilot vehicle {recommendation['vehicle_id']} does not have owner_email. "
                        "Email confirmation cannot be requested."
                    ),
                )

            confirmation_code = _generate_confirmation_code()
            confirmation_reference = _generate_confirmation_reference(recommendation_id)
            confirmation_links = _build_email_confirmation_links(recommendation_id, confirmation_code)

            email_subject = f"Service confirmation needed for {recommendation['vehicle_id']}"
            email_message = (
                f"Your vehicle {recommendation['vehicle_id']} has a service slot request at "
                f"{recommendation['recommended_start']}.\n\n"
                f"To confirm booking, click YES: {confirmation_links['yes_url']}\n"
                f"To decline booking, click NO: {confirmation_links['no_url']}\n\n"
                f"Reference: {confirmation_reference}\n"
                f"Confirmation code: {confirmation_code}\n"
            )

            email_result = send_email(owner_email, email_subject, email_message)
            confirmation_request = _create_email_confirmation_request(
                recommendation_id=recommendation_id,
                vehicle_id=recommendation["vehicle_id"],
                email_address=owner_email,
                code=confirmation_code,
                provider_message_id=email_result.message_id,
                last_error=email_result.error,
            )

            updated_rows = execute_query(
                """
                UPDATE service_recommendations
                SET status = %s,
                    approver_email = %s,
                    approved_at = CURRENT_TIMESTAMP,
                    customer_confirmation_status = %s,
                    customer_confirmation_method = %s,
                    customer_confirmation_email = %s,
                    customer_confirmation_phone = NULL,
                    customer_confirmation_requested_at = CURRENT_TIMESTAMP,
                    customer_confirmation_reference = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE recommendation_id = %s
                RETURNING recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                          service_type, priority, risk_score, reason, status, recipient, suggested_by,
                          approver_email, approved_at, booking_id,
                          customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                          customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                          customer_confirmation_declined_at, customer_confirmation_reference,
                          created_at, updated_at
                """,
                (
                    STATUS_PENDING_CUSTOMER_CONFIRMATION,
                    approver_email,
                    "pending" if email_result.ok else "send_failed",
                    "email",
                    owner_email,
                    confirmation_reference,
                    recommendation_id,
                ),
                fetch=True,
            )

            updated = _serialize_row(updated_rows[0])
            notification_message = (
                f"Approval completed for {recommendation_id}. Waiting for customer confirmation over email. "
                f"Reference: {confirmation_reference}."
            )
            if not email_result.ok:
                notification_message = (
                    f"Email send failed for {recommendation_id}. Confirmation still pending. "
                    f"Error: {email_result.error or 'unknown_error'}."
                )

            notification = _insert_notification(
                vehicle_id=updated["vehicle_id"],
                notification_type="booking_confirmation_requested",
                title=f"Customer confirmation needed for {updated['vehicle_id']}",
                message=notification_message,
                recipient=owner_email,
                channel="email",
            )

            await stream_manager.broadcast(
                "scheduling.recommendation.awaiting_customer_confirmation",
                {
                    "recommendation": updated,
                    "notification": notification,
                    "confirmation_reference": confirmation_reference,
                    "confirmation_method": "email",
                    "email_status": "sent" if email_result.ok else "failed",
                },
            )
            await stream_manager.broadcast(
                "notification.created",
                {
                    "notification": notification,
                    "source": "scheduling.recommendation.awaiting_customer_confirmation",
                },
            )

            return {
                "status": STATUS_PENDING_CUSTOMER_CONFIRMATION,
                "recommendation": updated,
                "notification": notification,
                "email_confirmation": {
                    "status": "sent" if email_result.ok else "failed",
                    "provider": email_result.provider,
                    "provider_message_id": email_result.message_id,
                    "reference": confirmation_reference,
                    "requested_at": confirmation_request.get("requested_at"),
                    "expires_at": confirmation_request.get("expires_at"),
                    "error": email_result.error,
                    "simulated": email_result.simulated,
                },
                "message": "Recommendation approved. Waiting for customer email confirmation.",
            }

        if _is_pilot_vehicle(recommendation["vehicle_id"]):
            owner_phone = _get_owner_phone(recommendation["vehicle_id"])
            if not owner_phone:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Pilot vehicle {recommendation['vehicle_id']} does not have owner_phone. "
                        "SMS confirmation cannot be requested."
                    ),
                )

            confirmation_code = _generate_confirmation_code()
            confirmation_reference = _generate_confirmation_reference(recommendation_id)
            sms_message = (
                f"Vehicle {recommendation['vehicle_id']} service request: slot {recommendation['recommended_start']}. "
                f"Reply YES {recommendation_id} {confirmation_code} to confirm, "
                f"or NO {recommendation_id} {confirmation_code} to decline."
            )

            sms_result = send_sms(owner_phone, sms_message)
            confirmation_request = _create_sms_confirmation_request(
                recommendation_id=recommendation_id,
                vehicle_id=recommendation["vehicle_id"],
                phone_number=owner_phone,
                code=confirmation_code,
                provider_message_id=sms_result.message_id,
                last_error=sms_result.error,
            )

            updated_rows = execute_query(
                """
                UPDATE service_recommendations
                SET status = %s,
                    approver_email = %s,
                    approved_at = CURRENT_TIMESTAMP,
                    customer_confirmation_status = %s,
                    customer_confirmation_method = %s,
                    customer_confirmation_email = NULL,
                    customer_confirmation_phone = %s,
                    customer_confirmation_requested_at = CURRENT_TIMESTAMP,
                    customer_confirmation_reference = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE recommendation_id = %s
                RETURNING recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                          service_type, priority, risk_score, reason, status, recipient, suggested_by,
                          approver_email, approved_at, booking_id,
                          customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                          customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                          customer_confirmation_declined_at, customer_confirmation_reference,
                          created_at, updated_at
                """,
                (
                    STATUS_PENDING_CUSTOMER_CONFIRMATION,
                    approver_email,
                    "pending" if sms_result.ok else "send_failed",
                    "sms",
                    owner_phone,
                    confirmation_reference,
                    recommendation_id,
                ),
                fetch=True,
            )

            updated = _serialize_row(updated_rows[0])
            notification_message = (
                f"Approval completed for {recommendation_id}. Waiting for customer confirmation over SMS. "
                f"Reference: {confirmation_reference}."
            )
            if not sms_result.ok:
                notification_message = (
                    f"SMS send failed for {recommendation_id}. Confirmation still pending. "
                    f"Error: {sms_result.error or 'unknown_error'}."
                )

            notification = _insert_notification(
                vehicle_id=updated["vehicle_id"],
                notification_type="booking_confirmation_requested",
                title=f"Customer confirmation needed for {updated['vehicle_id']}",
                message=notification_message,
                recipient=owner_phone,
                channel="sms",
            )

            await stream_manager.broadcast(
                "scheduling.recommendation.awaiting_customer_confirmation",
                {
                    "recommendation": updated,
                    "notification": notification,
                    "confirmation_reference": confirmation_reference,
                    "sms_provider": sms_result.provider,
                    "sms_status": "queued" if sms_result.ok else "failed",
                },
            )
            await stream_manager.broadcast(
                "notification.created",
                {
                    "notification": notification,
                    "source": "scheduling.recommendation.awaiting_customer_confirmation",
                },
            )

            return {
                "status": STATUS_PENDING_CUSTOMER_CONFIRMATION,
                "recommendation": updated,
                "notification": notification,
                "sms_confirmation": {
                    "status": "queued" if sms_result.ok else "failed",
                    "provider": sms_result.provider,
                    "provider_message_id": sms_result.message_id,
                    "reference": confirmation_reference,
                    "requested_at": confirmation_request.get("requested_at"),
                    "expires_at": confirmation_request.get("expires_at"),
                    "error": sms_result.error,
                    "simulated": sms_result.simulated,
                },
                "message": "Recommendation approved. Waiting for customer SMS confirmation.",
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
                customer_confirmation_status = NULL,
                customer_confirmation_method = NULL,
                customer_confirmation_email = NULL,
                customer_confirmation_phone = NULL,
                customer_confirmation_requested_at = NULL,
                customer_confirmation_confirmed_at = NULL,
                customer_confirmation_declined_at = NULL,
                customer_confirmation_reference = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE recommendation_id = %s
            RETURNING recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                      service_type, priority, risk_score, reason, status, recipient, suggested_by,
                      approver_email, approved_at, booking_id,
                      customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                      customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                      customer_confirmation_declined_at, customer_confirmation_reference,
                      created_at, updated_at
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


@router.post("/customer-confirmation/inbound")
async def process_customer_sms_confirmation(payload: CustomerSmsInboundRequest):
    try:
        _ensure_recommendation_schema()

        message_text = str(payload.message or payload.Body or "").strip()
        sender_phone = normalize_phone(payload.from_number or payload.From)
        provider_message_id = str(payload.provider_message_id or payload.MessageSid or "").strip() or None

        parsed = _parse_sms_decision(message_text)
        decision = parsed.get("decision")
        recommendation_id = str(payload.recommendation_id or parsed.get("recommendation_id") or "").strip().upper()
        provided_code = str(parsed.get("confirmation_code") or "").strip()

        if not recommendation_id:
            raise HTTPException(status_code=400, detail="Recommendation ID is required in SMS body")
        if decision not in {"yes", "no"}:
            raise HTTPException(status_code=400, detail="SMS decision must contain YES or NO")

        rows = execute_query(
            """
            SELECT recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                   service_type, priority, risk_score, reason, status, recipient, suggested_by,
                   approver_email, approved_at, booking_id,
                     customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                   customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                   customer_confirmation_declined_at, customer_confirmation_reference,
                   created_at, updated_at
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
            existing_booking_id = recommendation.get("booking_id")
            if not _booking_exists(existing_booking_id):
                repaired_booking_id = _ensure_booking_record_from_recommendation(
                    recommendation=recommendation,
                    reason="Repaired from booked recommendation after booking reset",
                    booking_id=existing_booking_id,
                )
                repaired_rows = execute_query(
                    """
                    UPDATE service_recommendations
                    SET booking_id = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE recommendation_id = %s
                    RETURNING recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                              service_type, priority, risk_score, reason, status, recipient, suggested_by,
                              approver_email, approved_at, booking_id,
                              customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                              customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                              customer_confirmation_declined_at, customer_confirmation_reference,
                              created_at, updated_at
                    """,
                    (repaired_booking_id, recommendation_id),
                    fetch=True,
                )
                repaired = _serialize_row(repaired_rows[0])
                return {
                    "status": "booked",
                    "booking_id": repaired_booking_id,
                    "recommendation": repaired,
                    "message": "Booking already confirmed. Missing booking row was recreated.",
                }

            return {
                "status": "booked",
                "booking_id": recommendation.get("booking_id"),
                "recommendation": recommendation,
                "message": "Booking already confirmed.",
            }
        if current_status == STATUS_CUSTOMER_DECLINED:
            return {
                "status": STATUS_CUSTOMER_DECLINED,
                "recommendation": recommendation,
                "message": "Customer already declined this recommendation.",
            }
        if current_status not in {STATUS_PENDING_CUSTOMER_CONFIRMATION, "recommended"}:
            return {
                "status": current_status,
                "recommendation": recommendation,
                "message": f"SMS confirmation is not applicable for status '{current_status}'.",
            }

        confirmation_request = _latest_confirmation_request(recommendation_id)
        if not confirmation_request:
            raise HTTPException(status_code=404, detail="SMS confirmation request not found")

        decision_status = str(confirmation_request.get("decision_status") or "").lower()
        if decision_status in {"confirmed", "declined", "expired"}:
            return {
                "status": recommendation.get("status"),
                "recommendation": recommendation,
                "message": "SMS confirmation already processed.",
            }

        expires_at = _parse_datetime(confirmation_request.get("expires_at"))
        if expires_at and expires_at < datetime.utcnow():
            _update_confirmation_request(
                request_id=str(confirmation_request["id"]),
                decision_status="expired",
                response_text=message_text or "expired_without_response",
                provider_message_id=provider_message_id,
                idempotency_key=payload.idempotency_key,
            )

            execute_query(
                """
                UPDATE service_recommendations
                SET status = %s,
                    customer_confirmation_status = 'expired',
                    customer_confirmation_method = 'sms',
                    customer_confirmation_email = NULL,
                    customer_confirmation_declined_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE recommendation_id = %s
                """,
                (STATUS_CUSTOMER_DECLINED, recommendation_id),
                fetch=False,
            )
            raise HTTPException(status_code=410, detail="SMS confirmation request has expired")

        expected_phone = normalize_phone(confirmation_request.get("phone_number"))
        if expected_phone and sender_phone and expected_phone != sender_phone:
            raise HTTPException(status_code=403, detail="Sender phone does not match confirmation target")

        expected_code = str(confirmation_request.get("confirmation_code") or "").strip()
        if expected_code and provided_code and expected_code != provided_code:
            raise HTTPException(status_code=400, detail="Invalid confirmation code")

        if decision == "no":
            _update_confirmation_request(
                request_id=str(confirmation_request["id"]),
                decision_status="declined",
                response_text=message_text or "NO",
                provider_message_id=provider_message_id,
                idempotency_key=payload.idempotency_key,
            )

            updated_rows = execute_query(
                """
                UPDATE service_recommendations
                SET status = %s,
                    customer_confirmation_status = 'declined',
                    customer_confirmation_method = 'sms',
                    customer_confirmation_email = NULL,
                    customer_confirmation_declined_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE recommendation_id = %s
                RETURNING recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                          service_type, priority, risk_score, reason, status, recipient, suggested_by,
                          approver_email, approved_at, booking_id,
                          customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                          customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                          customer_confirmation_declined_at, customer_confirmation_reference,
                          created_at, updated_at
                """,
                (STATUS_CUSTOMER_DECLINED, recommendation_id),
                fetch=True,
            )

            updated = _serialize_row(updated_rows[0])
            notification = _insert_notification(
                vehicle_id=updated["vehicle_id"],
                notification_type="booking_declined",
                title=f"Booking declined for {updated['vehicle_id']}",
                message=f"Customer declined booking for recommendation {recommendation_id} via SMS.",
                recipient=updated.get("customer_confirmation_phone") or updated.get("recipient"),
                channel="sms",
            )

            await stream_manager.broadcast(
                "scheduling.recommendation.customer_declined",
                {
                    "recommendation": updated,
                    "notification": notification,
                },
            )
            await stream_manager.broadcast(
                "notification.created",
                {
                    "notification": notification,
                    "source": "scheduling.recommendation.customer_declined",
                },
            )

            return {
                "status": STATUS_CUSTOMER_DECLINED,
                "recommendation": updated,
                "notification": notification,
                "message": "Customer declined booking via SMS.",
            }

        slot_start = _parse_datetime(str(recommendation.get("recommended_start")))
        if slot_start is None:
            raise HTTPException(status_code=500, detail="Recommendation has invalid slot timestamp")

        duration_hours = float(recommendation.get("estimated_duration_hours") or 1.0)
        conflict = _find_overlapping_booking(slot_start, duration_hours)
        if conflict:
            _update_confirmation_request(
                request_id=str(confirmation_request["id"]),
                decision_status="expired",
                response_text=message_text or "YES",
                provider_message_id=provider_message_id,
                idempotency_key=payload.idempotency_key,
            )

            updated_rows = execute_query(
                """
                UPDATE service_recommendations
                SET status = 'conflict',
                    reason = %s,
                    customer_confirmation_status = 'conflict',
                    customer_confirmation_method = 'sms',
                    customer_confirmation_email = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE recommendation_id = %s
                RETURNING recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                          service_type, priority, risk_score, reason, status, recipient, suggested_by,
                          approver_email, approved_at, booking_id,
                          customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                          customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                          customer_confirmation_declined_at, customer_confirmation_reference,
                          created_at, updated_at
                """,
                (f"Customer confirmed via SMS, but slot conflicts with booking {conflict.get('booking_id')}", recommendation_id),
                fetch=True,
            )

            updated = _serialize_row(updated_rows[0])
            return {
                "status": "conflict",
                "recommendation": updated,
                "conflict_booking": conflict,
                "message": "Customer confirmed but slot is no longer available.",
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
                [recommendation.get("reason") or "Confirmed by customer SMS"],
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
                booking_id = %s,
                customer_confirmation_status = 'confirmed',
                customer_confirmation_method = 'sms',
                customer_confirmation_email = NULL,
                customer_confirmation_confirmed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE recommendation_id = %s
            RETURNING recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                      service_type, priority, risk_score, reason, status, recipient, suggested_by,
                      approver_email, approved_at, booking_id,
                      customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                      customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                      customer_confirmation_declined_at, customer_confirmation_reference,
                      created_at, updated_at
            """,
            (booking_id, recommendation_id),
            fetch=True,
        )
        _update_confirmation_request(
            request_id=str(confirmation_request["id"]),
            decision_status="confirmed",
            response_text=message_text or "YES",
            provider_message_id=provider_message_id,
            idempotency_key=payload.idempotency_key,
        )

        updated = _serialize_row(updated_rows[0])
        confirmation_phone = updated.get("customer_confirmation_phone") or confirmation_request.get("phone_number")
        notification = _insert_notification(
            vehicle_id=updated["vehicle_id"],
            notification_type="booking_confirmed",
            title=f"Booking confirmed for {updated['vehicle_id']}",
            message=(
                f"Customer confirmed recommendation {recommendation_id} by SMS. "
                f"Booking {booking_id} is confirmed for {updated['recommended_start']}."
            ),
            recipient=confirmation_phone,
            channel="sms",
        )

        confirmation_sms = send_sms(
            confirmation_phone,
            (
                f"Booking confirmed for {updated['vehicle_id']}. "
                f"Booking ID: {booking_id}. Slot: {updated['recommended_start']}."
            ),
        )

        await stream_manager.broadcast(
            "scheduling.recommendation.customer_confirmed",
            {
                "recommendation": updated,
                "booking_id": booking_id,
                "notification": notification,
                "sms_status": "queued" if confirmation_sms.ok else "failed",
            },
        )
        await stream_manager.broadcast(
            "scheduling.booking.created",
            {
                "booking_id": booking_id,
                "vehicle_id": updated["vehicle_id"],
                "scheduled_date": updated["recommended_start"],
                "source": "customer_sms_confirmation",
            },
        )
        await stream_manager.broadcast(
            "notification.created",
            {
                "notification": notification,
                "source": "scheduling.recommendation.customer_confirmed",
            },
        )

        return {
            "status": "booked",
            "booking_id": booking_id,
            "recommendation": updated,
            "notification": notification,
            "message": "Customer confirmed booking via SMS.",
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/customer-confirmation/email")
async def process_customer_email_confirmation_get(
    recommendation_id: str,
    confirmation_code: str,
    decision: str,
    recipient_email: Optional[str] = None,
    provider_message_id: Optional[str] = None,
    idempotency_key: Optional[str] = None,
):
    payload = CustomerEmailConfirmRequest(
        recommendation_id=recommendation_id,
        confirmation_code=confirmation_code,
        decision=decision,
        recipient_email=recipient_email,
        provider_message_id=provider_message_id,
        idempotency_key=idempotency_key,
    )
    return await process_customer_email_confirmation(payload)


@router.post("/customer-confirmation/email")
async def process_customer_email_confirmation(payload: CustomerEmailConfirmRequest):
    try:
        _ensure_recommendation_schema()

        recommendation_id = str(payload.recommendation_id or "").strip().upper()
        provided_code = str(payload.confirmation_code or "").strip()
        decision = _normalize_customer_decision(payload.decision)
        recipient_email = normalize_email(payload.recipient_email)
        provider_message_id = str(payload.provider_message_id or "").strip() or None

        if not recommendation_id:
            raise HTTPException(status_code=400, detail="Recommendation ID is required")
        if not provided_code:
            raise HTTPException(status_code=400, detail="Confirmation code is required")
        if decision not in {"yes", "no"}:
            raise HTTPException(status_code=400, detail="Decision must be yes or no")

        rows = execute_query(
            """
            SELECT recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                   service_type, priority, risk_score, reason, status, recipient, suggested_by,
                   approver_email, approved_at, booking_id,
                   customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                   customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                   customer_confirmation_declined_at, customer_confirmation_reference,
                   created_at, updated_at
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
            existing_booking_id = recommendation.get("booking_id")
            if not _booking_exists(existing_booking_id):
                repaired_booking_id = _ensure_booking_record_from_recommendation(
                    recommendation=recommendation,
                    reason="Repaired from booked recommendation after booking reset",
                    booking_id=existing_booking_id,
                )
                repaired_rows = execute_query(
                    """
                    UPDATE service_recommendations
                    SET booking_id = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE recommendation_id = %s
                    RETURNING recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                              service_type, priority, risk_score, reason, status, recipient, suggested_by,
                              approver_email, approved_at, booking_id,
                              customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                              customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                              customer_confirmation_declined_at, customer_confirmation_reference,
                              created_at, updated_at
                    """,
                    (repaired_booking_id, recommendation_id),
                    fetch=True,
                )
                repaired = _serialize_row(repaired_rows[0])
                return {
                    "status": "booked",
                    "booking_id": repaired_booking_id,
                    "recommendation": repaired,
                    "message": "Booking already confirmed. Missing booking row was recreated.",
                }

            return {
                "status": "booked",
                "booking_id": recommendation.get("booking_id"),
                "recommendation": recommendation,
                "message": "Booking already confirmed.",
            }
        if current_status == STATUS_CUSTOMER_DECLINED:
            return {
                "status": STATUS_CUSTOMER_DECLINED,
                "recommendation": recommendation,
                "message": "Customer already declined this recommendation.",
            }
        if current_status not in {STATUS_PENDING_CUSTOMER_CONFIRMATION, "recommended"}:
            return {
                "status": current_status,
                "recommendation": recommendation,
                "message": f"Email confirmation is not applicable for status '{current_status}'.",
            }

        confirmation_request = _latest_email_confirmation_request(recommendation_id)
        if not confirmation_request:
            raise HTTPException(status_code=404, detail="Email confirmation request not found")

        decision_status = str(confirmation_request.get("decision_status") or "").lower()
        if decision_status in {"confirmed", "declined", "expired"}:
            return {
                "status": recommendation.get("status"),
                "recommendation": recommendation,
                "message": "Email confirmation already processed.",
            }

        expires_at = _parse_datetime(confirmation_request.get("expires_at"))
        if expires_at and expires_at < datetime.utcnow():
            _update_email_confirmation_request(
                request_id=str(confirmation_request["id"]),
                decision_status="expired",
                response_text=payload.decision,
                provider_message_id=provider_message_id,
                idempotency_key=payload.idempotency_key,
            )

            execute_query(
                """
                UPDATE service_recommendations
                SET status = %s,
                    customer_confirmation_status = 'expired',
                    customer_confirmation_method = 'email',
                    customer_confirmation_email = COALESCE(customer_confirmation_email, %s),
                    customer_confirmation_phone = NULL,
                    customer_confirmation_declined_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE recommendation_id = %s
                """,
                (STATUS_CUSTOMER_DECLINED, recipient_email or confirmation_request.get("email_address"), recommendation_id),
                fetch=False,
            )
            raise HTTPException(status_code=410, detail="Email confirmation request has expired")

        expected_email = normalize_email(confirmation_request.get("email_address"))
        if expected_email and recipient_email and expected_email != recipient_email:
            raise HTTPException(status_code=403, detail="Recipient email does not match confirmation target")

        expected_code = str(confirmation_request.get("confirmation_code") or "").strip()
        if expected_code and expected_code != provided_code:
            raise HTTPException(status_code=400, detail="Invalid confirmation code")

        if decision == "no":
            _update_email_confirmation_request(
                request_id=str(confirmation_request["id"]),
                decision_status="declined",
                response_text=payload.decision,
                provider_message_id=provider_message_id,
                idempotency_key=payload.idempotency_key,
            )

            updated_rows = execute_query(
                """
                UPDATE service_recommendations
                SET status = %s,
                    customer_confirmation_status = 'declined',
                    customer_confirmation_method = 'email',
                    customer_confirmation_email = COALESCE(customer_confirmation_email, %s),
                    customer_confirmation_phone = NULL,
                    customer_confirmation_declined_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE recommendation_id = %s
                RETURNING recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                          service_type, priority, risk_score, reason, status, recipient, suggested_by,
                          approver_email, approved_at, booking_id,
                          customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                          customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                          customer_confirmation_declined_at, customer_confirmation_reference,
                          created_at, updated_at
                """,
                (STATUS_CUSTOMER_DECLINED, expected_email or None, recommendation_id),
                fetch=True,
            )

            updated = _serialize_row(updated_rows[0])
            notification = _insert_notification(
                vehicle_id=updated["vehicle_id"],
                notification_type="booking_declined",
                title=f"Booking declined for {updated['vehicle_id']}",
                message=f"Customer declined booking for recommendation {recommendation_id} via email.",
                recipient=updated.get("customer_confirmation_email") or expected_email or updated.get("recipient"),
                channel="email",
            )

            await stream_manager.broadcast(
                "scheduling.recommendation.customer_declined",
                {
                    "recommendation": updated,
                    "notification": notification,
                },
            )
            await stream_manager.broadcast(
                "notification.created",
                {
                    "notification": notification,
                    "source": "scheduling.recommendation.customer_declined",
                },
            )

            return {
                "status": STATUS_CUSTOMER_DECLINED,
                "recommendation": updated,
                "notification": notification,
                "message": "Customer declined booking via email.",
            }

        slot_start = _parse_datetime(str(recommendation.get("recommended_start")))
        if slot_start is None:
            raise HTTPException(status_code=500, detail="Recommendation has invalid slot timestamp")

        duration_hours = float(recommendation.get("estimated_duration_hours") or 1.0)
        conflict = _find_overlapping_booking(slot_start, duration_hours)
        if conflict:
            _update_email_confirmation_request(
                request_id=str(confirmation_request["id"]),
                decision_status="expired",
                response_text=payload.decision,
                provider_message_id=provider_message_id,
                idempotency_key=payload.idempotency_key,
            )

            updated_rows = execute_query(
                """
                UPDATE service_recommendations
                SET status = 'conflict',
                    reason = %s,
                    customer_confirmation_status = 'conflict',
                    customer_confirmation_method = 'email',
                    customer_confirmation_email = COALESCE(customer_confirmation_email, %s),
                    customer_confirmation_phone = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE recommendation_id = %s
                RETURNING recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                          service_type, priority, risk_score, reason, status, recipient, suggested_by,
                          approver_email, approved_at, booking_id,
                          customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                          customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                          customer_confirmation_declined_at, customer_confirmation_reference,
                          created_at, updated_at
                """,
                (
                    f"Customer confirmed via email, but slot conflicts with booking {conflict.get('booking_id')}",
                    expected_email or None,
                    recommendation_id,
                ),
                fetch=True,
            )

            updated = _serialize_row(updated_rows[0])
            return {
                "status": "conflict",
                "recommendation": updated,
                "conflict_booking": conflict,
                "message": "Customer confirmed but slot is no longer available.",
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
                [recommendation.get("reason") or "Confirmed by customer email"],
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
                booking_id = %s,
                customer_confirmation_status = 'confirmed',
                customer_confirmation_method = 'email',
                customer_confirmation_email = COALESCE(customer_confirmation_email, %s),
                customer_confirmation_phone = NULL,
                customer_confirmation_confirmed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE recommendation_id = %s
            RETURNING recommendation_id, vehicle_id, recommended_start, estimated_duration_hours,
                      service_type, priority, risk_score, reason, status, recipient, suggested_by,
                      approver_email, approved_at, booking_id,
                      customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                      customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                      customer_confirmation_declined_at, customer_confirmation_reference,
                      created_at, updated_at
            """,
            (booking_id, expected_email or None, recommendation_id),
            fetch=True,
        )
        _update_email_confirmation_request(
            request_id=str(confirmation_request["id"]),
            decision_status="confirmed",
            response_text=payload.decision,
            provider_message_id=provider_message_id,
            idempotency_key=payload.idempotency_key,
        )

        updated = _serialize_row(updated_rows[0])
        confirmation_email = updated.get("customer_confirmation_email") or expected_email
        notification = _insert_notification(
            vehicle_id=updated["vehicle_id"],
            notification_type="booking_confirmed",
            title=f"Booking confirmed for {updated['vehicle_id']}",
            message=(
                f"Customer confirmed recommendation {recommendation_id} by email. "
                f"Booking {booking_id} is confirmed for {updated['recommended_start']}."
            ),
            recipient=confirmation_email,
            channel="email",
        )

        confirmation_email_result = send_email(
            confirmation_email,
            f"Booking confirmed for {updated['vehicle_id']}",
            (
                f"Booking confirmed for {updated['vehicle_id']}.\n"
                f"Booking ID: {booking_id}.\n"
                f"Slot: {updated['recommended_start']}."
            ),
        )

        await stream_manager.broadcast(
            "scheduling.recommendation.customer_confirmed",
            {
                "recommendation": updated,
                "booking_id": booking_id,
                "notification": notification,
                "email_status": "sent" if confirmation_email_result.ok else "failed",
            },
        )
        await stream_manager.broadcast(
            "scheduling.booking.created",
            {
                "booking_id": booking_id,
                "vehicle_id": updated["vehicle_id"],
                "scheduled_date": updated["recommended_start"],
                "source": "customer_email_confirmation",
            },
        )
        await stream_manager.broadcast(
            "notification.created",
            {
                "notification": notification,
                "source": "scheduling.recommendation.customer_confirmed",
            },
        )

        return {
            "status": "booked",
            "booking_id": booking_id,
            "recommendation": updated,
            "notification": notification,
            "email_confirmation": {
                "status": "sent" if confirmation_email_result.ok else "failed",
                "provider": confirmation_email_result.provider,
                "provider_message_id": confirmation_email_result.message_id,
                "error": confirmation_email_result.error,
                "simulated": confirmation_email_result.simulated,
            },
            "message": "Customer confirmed booking via email.",
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/customer-confirmation/webhook")
async def process_customer_sms_confirmation_webhook(request: Request):
    form = await request.form()
    payload = CustomerSmsInboundRequest(
        recommendation_id=form.get("recommendation_id"),
        message=form.get("message") or form.get("Body"),
        from_number=form.get("from_number") or form.get("From"),
        provider_message_id=form.get("provider_message_id") or form.get("MessageSid"),
        idempotency_key=form.get("idempotency_key"),
    )
    return await process_customer_sms_confirmation(payload)


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
                                            approver_email, rejected_at,
                                                                                        customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                                            customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                                            customer_confirmation_declined_at, customer_confirmation_reference,
                                            created_at, updated_at
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
                      approver_email, rejected_at,
                        customer_confirmation_status, customer_confirmation_method, customer_confirmation_email, customer_confirmation_phone,
                      customer_confirmation_requested_at, customer_confirmation_confirmed_at,
                      customer_confirmation_declined_at, customer_confirmation_reference,
                      created_at, updated_at
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
