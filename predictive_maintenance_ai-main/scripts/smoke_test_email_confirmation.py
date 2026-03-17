import json
import os
import sys
import time
import traceback
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from urllib import error as url_error
from urllib import parse as url_parse
from urllib import request as url_request

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

API_BASE = os.getenv("SMOKE_API_BASE", "http://localhost:8000").rstrip("/")
API_PREFIX = os.getenv("SMOKE_API_PREFIX", "/api")
TIMEOUT_SECONDS = 12
FLEET_VEHICLES = ["V-301", "V-302", "V-303", "V-304", "V-401", "V-402", "V-403"]
REPORT_PATH = PROJECT_ROOT / "smoke_email_report.json"


def _url(path: str) -> str:
    prefix = API_PREFIX.rstrip("/")
    if not path.startswith("/"):
        path = f"/{path}"
    return f"{API_BASE}{prefix}{path}"


def _decode_body(raw: bytes, content_type: str):
    text = raw.decode("utf-8", errors="replace")
    if "application/json" in str(content_type or "").lower():
        try:
            return json.loads(text)
        except Exception:
            return text
    try:
        return json.loads(text)
    except Exception:
        return text


def _http_request(method: str, path: str, payload=None):
    url = _url(path)
    body = None
    headers = {}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = url_request.Request(url=url, data=body, headers=headers, method=method.upper())

    try:
        with url_request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            raw = resp.read()
            parsed = _decode_body(raw, resp.headers.get("Content-Type"))
            return {
                "method": method.upper(),
                "path": path,
                "status_code": int(resp.status),
                "ok": 200 <= int(resp.status) < 300,
                "response": parsed,
            }
    except url_error.HTTPError as exc:
        raw = b""
        try:
            raw = exc.read()
        except Exception:
            raw = b""
        parsed = _decode_body(raw, exc.headers.get("Content-Type") if exc.headers else "")
        return {
            "method": method.upper(),
            "path": path,
            "status_code": int(exc.code),
            "ok": False,
            "response": parsed,
        }
    except Exception as exc:
        return {
            "method": method.upper(),
            "path": path,
            "status_code": 0,
            "ok": False,
            "response": {"error": str(exc)},
        }


def _http_root_check():
    url = f"{API_BASE}/"
    req = url_request.Request(url=url, method="GET")
    try:
        with url_request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return {"status_code": int(resp.status), "ok": 200 <= int(resp.status) < 300, "body": body}
    except url_error.HTTPError as exc:
        raw = b""
        try:
            raw = exc.read()
        except Exception:
            raw = b""
        return {
            "status_code": int(exc.code),
            "ok": False,
            "body": raw.decode("utf-8", errors="replace"),
        }
    except Exception as exc:
        return {"status_code": 0, "ok": False, "body": str(exc)}


def _http_root_check_with_retry(max_attempts: int = 3, delay_seconds: float = 1.5):
    last = None
    for attempt in range(1, max_attempts + 1):
        current = _http_root_check()
        current["attempt"] = attempt
        last = current
        if current.get("ok"):
            return current
        if attempt < max_attempts:
            time.sleep(delay_seconds)
    return last or {"status_code": 0, "ok": False, "body": "unknown"}


def _create_recommendation(vehicle_id: str):
    service_date = (date.today() + timedelta(days=120)).isoformat()
    payload = {
        "vehicle_id": vehicle_id,
        "service_date": service_date,
        "notes": "smoke-test email confirmation",
        "priority": "high",
        "risk_score": 88,
        "suggested_by": "smoke-test",
        "recipient": "maintenance.manager@fleet.local",
    }
    return _http_request("POST", "/scheduling/recommendations", payload)


def _approve_recommendation(recommendation_id: str):
    payload = {
        "approver_email": "qa.smoke@fleet.local",
        "notes": "smoke approval",
    }
    return _http_request("POST", f"/scheduling/recommendations/{recommendation_id}/approve", payload)


def _get_latest_email_code(recommendation_id: str):
    try:
        from database import execute_query

        rows = execute_query(
            """
            SELECT confirmation_code, email_address, requested_at, expires_at
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
        return rows[0]
    except Exception as exc:
        return {"error": str(exc)}


def _confirm_email_yes(recommendation_id: str, code: str, recipient_email: str):
    payload = {
        "recommendation_id": recommendation_id,
        "confirmation_code": code,
        "decision": "yes",
        "recipient_email": recipient_email,
    }
    return _http_request("POST", "/scheduling/customer-confirmation/email", payload)


def _write_report(report: dict):
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")


def main():
    report = {
        "timestamp_utc": datetime.now(UTC).isoformat(),
        "api_base": API_BASE,
        "api_prefix": API_PREFIX,
        "steps": [],
        "summary": {},
    }

    try:
        root = _http_root_check_with_retry()
        report["steps"].append({"step": "backend_root", **root})

        if not root.get("ok"):
            report["summary"] = {
                "result": "fail",
                "reason": "backend_not_reachable",
            }
            return

        ready_check = _http_request("GET", "/health/ready")
        report["steps"].append({"step": "ready_check", **ready_check})

        pending = _http_request("GET", "/scheduling/recommendations/pending?limit=100")
        report["steps"].append({"step": "list_pending", **pending})

        recs = []
        if pending.get("ok") and isinstance(pending.get("response"), dict):
            recs = pending["response"].get("recommendations") or []

        candidate = None
        for rec in recs:
            if rec.get("vehicle_id") in FLEET_VEHICLES and rec.get("status") == "recommended":
                candidate = rec
                break

        if not candidate:
            for vehicle_id in FLEET_VEHICLES:
                created = _create_recommendation(vehicle_id)
                report["steps"].append({"step": f"create_recommendation_{vehicle_id}", **created})
                if created.get("ok") and isinstance(created.get("response"), dict):
                    candidate = created["response"].get("recommendation")
                    if candidate:
                        break

        if not candidate:
            report["summary"] = {
                "result": "partial",
                "reason": "no_recommendation_available",
            }
            return

        recommendation_id = candidate.get("recommendation_id")
        approve = _approve_recommendation(recommendation_id)
        report["steps"].append({"step": "approve_recommendation", "recommendation_id": recommendation_id, **approve})

        if not approve.get("ok"):
            report["summary"] = {
                "result": "partial",
                "reason": "approve_failed",
                "recommendation_id": recommendation_id,
            }
            return

        approval_payload = approve.get("response") if isinstance(approve.get("response"), dict) else {}
        approval_status = str(approval_payload.get("status") or "")
        recommendation = approval_payload.get("recommendation") or {}
        confirmation_method = recommendation.get("customer_confirmation_method")

        report["summary"]["recommendation_id"] = recommendation_id
        report["summary"]["approval_status"] = approval_status
        report["summary"]["confirmation_method"] = confirmation_method

        endpoint_probe = _http_request(
            "POST",
            "/scheduling/customer-confirmation/email",
            {
                "recommendation_id": "RCM-NOT-EXIST",
                "confirmation_code": "000000",
                "decision": "yes",
                "recipient_email": "nobody@example.com",
            },
        )
        report["steps"].append({"step": "email_endpoint_probe", **endpoint_probe})

        if approval_status == "pending_customer_confirmation" and confirmation_method == "email":
            email_row = _get_latest_email_code(recommendation_id)
            found_email_row = bool(email_row and not email_row.get("error"))
            report["steps"].append({"step": "email_code_lookup", "found": found_email_row, "row": email_row})

            if found_email_row:
                email_confirm = _confirm_email_yes(
                    recommendation_id=recommendation_id,
                    code=str(email_row.get("confirmation_code") or ""),
                    recipient_email=str(email_row.get("email_address") or ""),
                )
                report["steps"].append({"step": "email_confirm_yes", **email_confirm})
                if email_confirm.get("ok") and isinstance(email_confirm.get("response"), dict):
                    report["summary"]["final_status"] = email_confirm["response"].get("status")
                    report["summary"]["booking_id"] = email_confirm["response"].get("booking_id")

        if "result" not in report["summary"]:
            report["summary"]["result"] = "pass"
    except Exception as exc:
        report["summary"] = {
            "result": "fail",
            "reason": "exception",
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }
    finally:
        _write_report(report)


if __name__ == "__main__":
    main()
