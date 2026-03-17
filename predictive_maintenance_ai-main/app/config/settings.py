import os
from typing import Set


def _read_bool_env(name: str, default: bool) -> bool:
	value = str(os.getenv(name, str(default))).strip().lower()
	if value in {"1", "true", "yes", "on"}:
		return True
	if value in {"0", "false", "no", "off"}:
		return False
	return default


def _read_positive_int_env(name: str, fallback: int) -> int:
	raw = str(os.getenv(name, fallback)).strip()
	try:
		parsed = int(raw)
	except (TypeError, ValueError):
		return fallback
	return parsed if parsed > 0 else fallback


def _read_vehicle_set_env(name: str, fallback: str) -> Set[str]:
	raw = str(os.getenv(name, fallback)).strip()
	if not raw:
		return set()
	return {
		entry.strip().upper()
		for entry in raw.split(",")
		if entry and entry.strip()
	}


# --- Pilot gate (restricted rollout) ---
SMS_PILOT_ENABLED = _read_bool_env("SMS_PILOT_ENABLED", True)
SMS_PILOT_VEHICLES = _read_vehicle_set_env("SMS_PILOT_VEHICLES", "V-402,V-403")
SMS_CONFIRMATION_TIMEOUT_MINUTES = _read_positive_int_env("SMS_CONFIRMATION_TIMEOUT_MINUTES", 1440)

EMAIL_CONFIRMATION_ENABLED = _read_bool_env("EMAIL_CONFIRMATION_ENABLED", True)
EMAIL_CONFIRMATION_VEHICLES = _read_vehicle_set_env(
	"EMAIL_CONFIRMATION_VEHICLES",
	"V-301,V-302,V-303,V-304,V-401,V-402,V-403",
)
EMAIL_CONFIRMATION_TIMEOUT_MINUTES = _read_positive_int_env("EMAIL_CONFIRMATION_TIMEOUT_MINUTES", 1440)
EMAIL_CONFIRMATION_BASE_URL = str(
	os.getenv(
		"EMAIL_CONFIRMATION_BASE_URL",
		"http://localhost:8000/api/scheduling/customer-confirmation/email",
	)
).strip()


# --- Provider settings (Twilio primary) ---
TWILIO_ACCOUNT_SID = str(os.getenv("TWILIO_ACCOUNT_SID", "")).strip()
TWILIO_AUTH_TOKEN = str(os.getenv("TWILIO_AUTH_TOKEN", "")).strip()
TWILIO_FROM_NUMBER = str(os.getenv("TWILIO_FROM_NUMBER", "")).strip()
TWILIO_TIMEOUT_SECONDS = _read_positive_int_env("TWILIO_TIMEOUT_SECONDS", 12)


# --- Provider settings (Gmail SMTP primary for email confirmation) ---
SMTP_ENABLED = _read_bool_env("SMTP_ENABLED", False)
SMTP_HOST = str(os.getenv("SMTP_HOST", "smtp.gmail.com")).strip()
SMTP_PORT = _read_positive_int_env("SMTP_PORT", 587)
SMTP_USERNAME = str(os.getenv("SMTP_USERNAME", "")).strip()
SMTP_PASSWORD = str(os.getenv("SMTP_PASSWORD", "")).strip()
SMTP_FROM_EMAIL = str(os.getenv("SMTP_FROM_EMAIL", "")).strip()
SMTP_USE_TLS = _read_bool_env("SMTP_USE_TLS", True)
SMTP_TIMEOUT_SECONDS = _read_positive_int_env("SMTP_TIMEOUT_SECONDS", 15)


def is_sms_pilot_vehicle(vehicle_id: str) -> bool:
	normalized = str(vehicle_id or "").strip().upper()
	return SMS_PILOT_ENABLED and normalized in SMS_PILOT_VEHICLES


def is_email_confirmation_vehicle(vehicle_id: str) -> bool:
	normalized = str(vehicle_id or "").strip().upper()
	return EMAIL_CONFIRMATION_ENABLED and normalized in EMAIL_CONFIRMATION_VEHICLES
