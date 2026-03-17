import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from urllib import error as url_error
from urllib import request as url_request

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from database import execute_query  # noqa: E402


def _post_json(url: str, payload: dict, timeout_seconds: int = 15) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = url_request.Request(
        url=url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with url_request.urlopen(req, timeout=timeout_seconds) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return {
                "ok": 200 <= int(resp.status) < 300,
                "status_code": int(resp.status),
                "response": json.loads(raw) if raw else {},
            }
    except url_error.HTTPError as exc:
        raw = ""
        try:
            raw = exc.read().decode("utf-8", errors="replace")
        except Exception:
            raw = ""
        parsed = None
        try:
            parsed = json.loads(raw) if raw else None
        except Exception:
            parsed = raw
        return {
            "ok": False,
            "status_code": int(exc.code),
            "response": parsed,
        }
    except Exception as exc:
        return {
            "ok": False,
            "status_code": 0,
            "response": {"error": str(exc)},
        }


def _find_target_request(recommendation_id: str | None):
    if recommendation_id:
        rows = execute_query(
            """
            SELECT r.recommendation_id, r.vehicle_id, r.status, r.booking_id,
                   r.recommended_start, r.customer_confirmation_status,
                   e.confirmation_code, e.email_address, e.decision_status, e.requested_at, e.expires_at
            FROM service_recommendations r
            LEFT JOIN LATERAL (
                SELECT confirmation_code, email_address, decision_status, requested_at, expires_at
                FROM email_confirmation_requests
                WHERE recommendation_id = r.recommendation_id
                ORDER BY requested_at DESC
                LIMIT 1
            ) e ON TRUE
            WHERE r.recommendation_id = %s
            LIMIT 1
            """,
            (recommendation_id,),
            fetch=True,
        )
        return rows[0] if rows else None

    rows = execute_query(
        """
        SELECT r.recommendation_id, r.vehicle_id, r.status, r.booking_id,
               r.recommended_start, r.customer_confirmation_status,
               e.confirmation_code, e.email_address, e.decision_status, e.requested_at, e.expires_at
        FROM service_recommendations r
        JOIN LATERAL (
            SELECT confirmation_code, email_address, decision_status, requested_at, expires_at
            FROM email_confirmation_requests
            WHERE recommendation_id = r.recommendation_id
            ORDER BY requested_at DESC
            LIMIT 1
        ) e ON TRUE
        WHERE r.customer_confirmation_method = 'email'
        ORDER BY e.requested_at DESC
        LIMIT 1
        """,
        fetch=True,
    )
    return rows[0] if rows else None


def _fetch_booking(booking_id: str | None):
    if not booking_id:
        return None
    rows = execute_query(
        """
        SELECT booking_id, vehicle_id, scheduled_date, service_type, estimated_duration_hours,
               status, priority, created_at, updated_at
        FROM service_bookings
        WHERE booking_id = %s
        LIMIT 1
        """,
        (booking_id,),
        fetch=True,
    )
    return rows[0] if rows else None


def main() -> None:
    parser = argparse.ArgumentParser(description="Diagnose email YES -> booking persistence flow")
    parser.add_argument("--recommendation-id", default="", help="Optional recommendation id to test")
    parser.add_argument("--confirmation-code", default="", help="Optional confirmation code override")
    parser.add_argument("--recipient-email", default="", help="Optional recipient email override")
    parser.add_argument("--api-base", default="http://localhost:8000", help="Backend base URL")
    parser.add_argument("--decision", default="yes", choices=["yes", "no"], help="Decision to submit")
    parser.add_argument("--report", default=str(PROJECT_ROOT / "diag_email_booking_report.json"), help="Report output path")
    args = parser.parse_args()

    report: dict = {
        "timestamp_utc": datetime.now(UTC).isoformat(),
        "api_base": args.api_base.rstrip("/"),
        "decision": args.decision,
        "target": {},
        "before": {},
        "request": {},
        "api_result": {},
        "after": {},
    }

    target = _find_target_request(args.recommendation_id.strip().upper() or None)
    if not target:
        report["error"] = "No email confirmation recommendation found"
        Path(args.report).write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        print(json.dumps(report, indent=2, default=str))
        return

    recommendation_id = str(target.get("recommendation_id") or "").strip().upper()
    confirmation_code = str(args.confirmation_code or target.get("confirmation_code") or "").strip()
    recipient_email = str(args.recipient_email or target.get("email_address") or "").strip()

    report["target"] = {
        "recommendation_id": recommendation_id,
        "vehicle_id": target.get("vehicle_id"),
        "status": target.get("status"),
        "booking_id": target.get("booking_id"),
        "recommended_start": target.get("recommended_start"),
        "customer_confirmation_status": target.get("customer_confirmation_status"),
        "email_request_status": target.get("decision_status"),
        "email_requested_at": target.get("requested_at"),
        "email_expires_at": target.get("expires_at"),
        "email_address": recipient_email,
    }

    before_booking = _fetch_booking(str(target.get("booking_id") or "").strip() or None)
    report["before"] = {
        "booking_exists_for_recommendation_booking_id": bool(before_booking),
        "booking": before_booking,
    }

    payload = {
        "recommendation_id": recommendation_id,
        "confirmation_code": confirmation_code,
        "decision": args.decision,
        "recipient_email": recipient_email or None,
    }
    report["request"] = payload

    api_url = f"{args.api_base.rstrip('/')}/api/scheduling/customer-confirmation/email"
    api_result = _post_json(api_url, payload)
    report["api_result"] = api_result

    response_payload = api_result.get("response") if isinstance(api_result.get("response"), dict) else {}
    response_booking_id = str(response_payload.get("booking_id") or "").strip()

    latest_rows = execute_query(
        """
        SELECT recommendation_id, vehicle_id, status, booking_id, customer_confirmation_status,
               customer_confirmation_method, customer_confirmation_email, customer_confirmation_confirmed_at,
               customer_confirmation_declined_at, updated_at
        FROM service_recommendations
        WHERE recommendation_id = %s
        LIMIT 1
        """,
        (recommendation_id,),
        fetch=True,
    )
    latest_recommendation = latest_rows[0] if latest_rows else None

    latest_booking_id = response_booking_id or str((latest_recommendation or {}).get("booking_id") or "").strip()
    after_booking = _fetch_booking(latest_booking_id or None)

    report["after"] = {
        "recommendation": latest_recommendation,
        "booking_lookup_id": latest_booking_id or None,
        "booking_exists": bool(after_booking),
        "booking": after_booking,
    }

    Path(args.report).write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps(report, indent=2, default=str))


if __name__ == "__main__":
    main()
