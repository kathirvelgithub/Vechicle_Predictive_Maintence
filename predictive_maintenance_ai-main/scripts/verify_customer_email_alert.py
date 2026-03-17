import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

load_dotenv(PROJECT_ROOT / ".env", override=True)

from app.services.email_gateway import send_email  # noqa: E402
from database import execute_query  # noqa: E402


def main() -> None:
    vehicle_id = "V-403"
    rows = execute_query(
        "SELECT vehicle_id, owner_email FROM vehicles WHERE vehicle_id = %s LIMIT 1",
        (vehicle_id,),
        fetch=True,
    )

    report = {
        "timestamp_utc": datetime.now(UTC).isoformat(),
        "vehicle_id": vehicle_id,
        "customer": {},
        "email_send": {},
        "result": "fail",
    }

    if not rows:
        report["result"] = "fail"
        report["error"] = f"Vehicle {vehicle_id} not found"
    else:
        row = rows[0]
        customer_email = str(row.get("owner_email") or "").strip()
        report["customer"] = {
            "vehicle_id": row.get("vehicle_id"),
            "owner_email": customer_email,
        }

        if not customer_email:
            report["result"] = "fail"
            report["error"] = "Customer email is empty"
        else:
            subject = f"Maintenance Alert for {vehicle_id}"
            message = (
                f"Hello, this is a verification alert for {vehicle_id}.\n\n"
                "Your vehicle has triggered a maintenance risk event. "
                "Please review the dashboard and schedule service if required.\n\n"
                "This message confirms SMTP email delivery from the backend."
            )
            send_result = send_email(customer_email, subject, message)
            report["email_send"] = {
                "ok": send_result.ok,
                "provider": send_result.provider,
                "simulated": send_result.simulated,
                "has_message_id": bool(send_result.message_id),
                "error": send_result.error,
            }
            report["result"] = "pass" if send_result.ok else "fail"

    report_path = PROJECT_ROOT / "customer_email_alert_verification.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
