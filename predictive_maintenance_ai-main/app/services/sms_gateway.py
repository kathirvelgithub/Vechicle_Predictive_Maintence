import uuid
from dataclasses import dataclass
from typing import Optional

import requests

from app.config.settings import (
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER,
    TWILIO_TIMEOUT_SECONDS,
)


@dataclass
class SmsSendResult:
    ok: bool
    provider: str
    message_id: Optional[str] = None
    error: Optional[str] = None
    simulated: bool = False


def normalize_phone(phone_number: Optional[str]) -> str:
    raw = str(phone_number or "").strip()
    if not raw:
        return ""

    if raw.startswith("00"):
        raw = f"+{raw[2:]}"

    if raw.startswith("+"):
        digits = "".join(ch for ch in raw[1:] if ch.isdigit())
        return f"+{digits}" if digits else ""

    digits = "".join(ch for ch in raw if ch.isdigit())
    if not digits:
        return ""

    if len(digits) == 10:
        return f"+91{digits}"
    if len(digits) == 12 and digits.startswith("91"):
        return f"+{digits}"

    return f"+{digits}"


def _can_use_twilio() -> bool:
    return bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER)


def send_sms(phone_number: Optional[str], message: str) -> SmsSendResult:
    normalized_phone = normalize_phone(phone_number)
    body = str(message or "").strip()

    if not normalized_phone:
        return SmsSendResult(
            ok=False,
            provider="twilio",
            error="invalid_phone_number",
        )

    if not body:
        return SmsSendResult(
            ok=False,
            provider="twilio",
            error="empty_sms_body",
        )

    if not _can_use_twilio():
        return SmsSendResult(
            ok=True,
            provider="mock",
            message_id=f"mock-{uuid.uuid4().hex[:12]}",
            simulated=True,
        )

    try:
        response = requests.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json",
            data={
                "To": normalized_phone,
                "From": TWILIO_FROM_NUMBER,
                "Body": body,
            },
            auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
            timeout=TWILIO_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        return SmsSendResult(
            ok=False,
            provider="twilio",
            error=f"request_error:{exc}",
        )

    if response.status_code >= 300:
        preview = response.text[:300] if response.text else ""
        return SmsSendResult(
            ok=False,
            provider="twilio",
            error=f"http_{response.status_code}:{preview}",
        )

    try:
        payload = response.json()
    except Exception:
        payload = {}

    return SmsSendResult(
        ok=True,
        provider="twilio",
        message_id=payload.get("sid"),
    )
