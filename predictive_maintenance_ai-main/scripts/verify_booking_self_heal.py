import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.api.routes_scheduling import CustomerEmailConfirmRequest, process_customer_email_confirmation  # noqa: E402
from database import execute_query  # noqa: E402


def _fetch_target():
    rows = execute_query(
        """
        SELECT r.recommendation_id, r.vehicle_id, r.booking_id,
               COALESCE(r.customer_confirmation_email, e.email_address) AS email_address,
               e.confirmation_code
        FROM service_recommendations r
        JOIN LATERAL (
            SELECT email_address, confirmation_code, requested_at
            FROM email_confirmation_requests
            WHERE recommendation_id = r.recommendation_id
            ORDER BY requested_at DESC
            LIMIT 1
        ) e ON TRUE
        WHERE r.status = 'booked'
          AND r.customer_confirmation_method = 'email'
          AND r.booking_id IS NOT NULL
        ORDER BY r.updated_at DESC
        LIMIT 1
        """,
        fetch=True,
    )
    return rows[0] if rows else None


def _booking_exists(booking_id: str) -> bool:
    rows = execute_query(
        "SELECT booking_id FROM service_bookings WHERE booking_id = %s LIMIT 1",
        (booking_id,),
        fetch=True,
    )
    return bool(rows)


def main() -> None:
    report = {
        "timestamp_utc": datetime.now(UTC).isoformat(),
        "target": None,
        "before": {},
        "action": {},
        "after": {},
        "result": "fail",
    }

    target = _fetch_target()
    if not target:
        report["error"] = "No booked email recommendation found for self-heal test"
        out = PROJECT_ROOT / "self_heal_booking_report.json"
        out.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report, indent=2))
        return

    recommendation_id = str(target.get("recommendation_id") or "").strip().upper()
    booking_id = str(target.get("booking_id") or "").strip()
    email_address = str(target.get("email_address") or "").strip()
    confirmation_code = str(target.get("confirmation_code") or "").strip()

    report["target"] = {
        "recommendation_id": recommendation_id,
        "vehicle_id": target.get("vehicle_id"),
        "booking_id": booking_id,
        "email_address": email_address,
        "confirmation_code": confirmation_code,
    }

    report["before"]["booking_exists"] = _booking_exists(booking_id)

    execute_query(
        "DELETE FROM service_bookings WHERE booking_id = %s",
        (booking_id,),
        fetch=False,
    )
    report["action"]["deleted_booking_id"] = booking_id
    report["action"]["booking_exists_after_delete"] = _booking_exists(booking_id)

    payload = CustomerEmailConfirmRequest(
        recommendation_id=recommendation_id,
        confirmation_code=confirmation_code,
        decision="yes",
        recipient_email=email_address,
    )
    response = asyncio.run(process_customer_email_confirmation(payload))
    report["action"]["confirmation_response"] = response

    repaired_booking_id = str(response.get("booking_id") or booking_id).strip()
    report["after"]["booking_lookup_id"] = repaired_booking_id
    report["after"]["booking_exists"] = _booking_exists(repaired_booking_id)

    rec_rows = execute_query(
        """
        SELECT recommendation_id, status, booking_id, customer_confirmation_status,
               customer_confirmation_method, updated_at
        FROM service_recommendations
        WHERE recommendation_id = %s
        LIMIT 1
        """,
        (recommendation_id,),
        fetch=True,
    )
    report["after"]["recommendation"] = rec_rows[0] if rec_rows else None

    report["result"] = "pass" if report["after"]["booking_exists"] else "fail"

    out = PROJECT_ROOT / "self_heal_booking_report.json"
    out.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps(report, indent=2, default=str))


if __name__ == "__main__":
    main()
