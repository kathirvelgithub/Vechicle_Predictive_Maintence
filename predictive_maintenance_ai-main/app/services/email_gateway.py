import smtplib
import uuid
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.config.settings import (
    SMTP_ENABLED,
    SMTP_FROM_EMAIL,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_TIMEOUT_SECONDS,
    SMTP_USERNAME,
    SMTP_USE_TLS,
)


@dataclass
class EmailSendResult:
    ok: bool
    provider: str
    message_id: Optional[str] = None
    error: Optional[str] = None
    simulated: bool = False


def normalize_email(email: Optional[str]) -> str:
    raw = str(email or "").strip().lower()
    if "@" not in raw:
        return ""
    local_part, _, domain = raw.partition("@")
    if not local_part or not domain:
        return ""
    return f"{local_part}@{domain}"


def _can_use_smtp() -> bool:
    sender = SMTP_FROM_EMAIL or SMTP_USERNAME
    return bool(SMTP_ENABLED and SMTP_HOST and SMTP_PORT and sender and SMTP_PASSWORD)


def send_email(
    recipient_email: Optional[str],
    subject: str,
    body_text: str,
    body_html: Optional[str] = None,
) -> EmailSendResult:
    recipient = normalize_email(recipient_email)
    if not recipient:
        return EmailSendResult(
            ok=False,
            provider="gmail-smtp",
            error="invalid_recipient_email",
        )

    message_subject = str(subject or "Service confirmation").strip()
    message_body_text = str(body_text or "").strip()
    if not message_subject:
        message_subject = "Service confirmation"
    if not message_body_text:
        message_body_text = "Please review your service confirmation details."

    if not _can_use_smtp():
        return EmailSendResult(
            ok=True,
            provider="mock",
            message_id=f"mock-{uuid.uuid4().hex[:12]}",
            simulated=True,
        )

    sender = normalize_email(SMTP_FROM_EMAIL) or normalize_email(SMTP_USERNAME)
    if not sender:
        return EmailSendResult(
            ok=False,
            provider="gmail-smtp",
            error="invalid_sender_email",
        )

    mime_message = MIMEMultipart("alternative")
    mime_message["Subject"] = message_subject
    mime_message["From"] = sender
    mime_message["To"] = recipient
    mime_message["Message-Id"] = f"<{uuid.uuid4().hex}@gmail-smtp.local>"

    mime_message.attach(MIMEText(message_body_text, "plain", "utf-8"))
    if body_html:
        mime_message.attach(MIMEText(str(body_html), "html", "utf-8"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=SMTP_TIMEOUT_SECONDS) as smtp:
            if SMTP_USE_TLS:
                smtp.starttls()
            if SMTP_USERNAME and SMTP_PASSWORD:
                smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
            smtp.sendmail(sender, [recipient], mime_message.as_string())
    except Exception as exc:
        return EmailSendResult(
            ok=False,
            provider="gmail-smtp",
            error=f"smtp_error:{exc}",
        )

    return EmailSendResult(
        ok=True,
        provider="gmail-smtp",
        message_id=mime_message.get("Message-Id"),
    )
