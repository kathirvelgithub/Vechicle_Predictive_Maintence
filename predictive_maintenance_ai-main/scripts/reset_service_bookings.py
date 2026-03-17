"""Reset service bookings for a fresh confirmation pilot run.

This script is intentionally conservative:
- Deletes rows from service_bookings.
- Clears booking references from service_recommendations.
- Reverts recommendations in status 'booked' back to 'recommended'.
- Normalizes vehicle scheduling flags (status/next_service_date).

Run with --yes to apply changes.
"""

from pathlib import Path
import argparse
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from database import get_connection


def _fetch_count(cursor, query: str) -> int:
    cursor.execute(query)
    row = cursor.fetchone()
    if not row:
        return 0
    return int(row[0] or 0)


def _ensure_recommendation_columns(cursor) -> None:
    statements = [
        "ALTER TABLE service_recommendations ADD COLUMN IF NOT EXISTS customer_confirmation_status VARCHAR(40)",
        "ALTER TABLE service_recommendations ADD COLUMN IF NOT EXISTS customer_confirmation_method VARCHAR(20)",
        "ALTER TABLE service_recommendations ADD COLUMN IF NOT EXISTS customer_confirmation_email VARCHAR(255)",
        "ALTER TABLE service_recommendations ADD COLUMN IF NOT EXISTS customer_confirmation_phone VARCHAR(30)",
        "ALTER TABLE service_recommendations ADD COLUMN IF NOT EXISTS customer_confirmation_requested_at TIMESTAMP",
        "ALTER TABLE service_recommendations ADD COLUMN IF NOT EXISTS customer_confirmation_confirmed_at TIMESTAMP",
        "ALTER TABLE service_recommendations ADD COLUMN IF NOT EXISTS customer_confirmation_declined_at TIMESTAMP",
        "ALTER TABLE service_recommendations ADD COLUMN IF NOT EXISTS customer_confirmation_reference VARCHAR(120)",
    ]
    for statement in statements:
        cursor.execute(statement)


def _preview(cursor) -> dict:
    return {
        "bookings": _fetch_count(cursor, "SELECT COUNT(*) FROM service_bookings"),
        "booked_recommendations": _fetch_count(
            cursor,
            "SELECT COUNT(*) FROM service_recommendations WHERE status = 'booked' OR booking_id IS NOT NULL",
        ),
        "scheduled_vehicles": _fetch_count(
            cursor,
            "SELECT COUNT(*) FROM vehicles WHERE status = 'scheduled' OR next_service_date IS NOT NULL",
        ),
    }


def _apply(cursor) -> dict:
    cursor.execute("DELETE FROM service_bookings")
    deleted_bookings = cursor.rowcount

    cursor.execute(
        """
        UPDATE service_recommendations
        SET status = CASE WHEN status = 'booked' THEN 'recommended' ELSE status END,
            booking_id = NULL,
            customer_confirmation_status = CASE WHEN status = 'booked' THEN NULL ELSE customer_confirmation_status END,
            customer_confirmation_method = CASE WHEN status = 'booked' THEN NULL ELSE customer_confirmation_method END,
            customer_confirmation_email = CASE WHEN status = 'booked' THEN NULL ELSE customer_confirmation_email END,
            customer_confirmation_phone = CASE WHEN status = 'booked' THEN NULL ELSE customer_confirmation_phone END,
            customer_confirmation_requested_at = CASE WHEN status = 'booked' THEN NULL ELSE customer_confirmation_requested_at END,
            customer_confirmation_confirmed_at = CASE WHEN status = 'booked' THEN NULL ELSE customer_confirmation_confirmed_at END,
            customer_confirmation_declined_at = CASE WHEN status = 'booked' THEN NULL ELSE customer_confirmation_declined_at END,
            customer_confirmation_reference = CASE WHEN status = 'booked' THEN NULL ELSE customer_confirmation_reference END,
            updated_at = CURRENT_TIMESTAMP
        WHERE booking_id IS NOT NULL OR status = 'booked'
        """
    )
    updated_recommendations = cursor.rowcount

    cursor.execute(
        """
        UPDATE vehicles
        SET status = 'active',
            next_service_date = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE status = 'scheduled' OR next_service_date IS NOT NULL
        """
    )
    normalized_vehicles = cursor.rowcount

    return {
        "deleted_bookings": deleted_bookings,
        "updated_recommendations": updated_recommendations,
        "normalized_vehicles": normalized_vehicles,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Reset service bookings and normalize booking references")
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Apply the reset. Without this flag, script only prints what would change.",
    )
    args = parser.parse_args()

    conn = get_connection()
    try:
        with conn:
            with conn.cursor() as cursor:
                _ensure_recommendation_columns(cursor)
                preview = _preview(cursor)
                print("[preview] bookings:", preview["bookings"])
                print("[preview] recommendations linked to bookings:", preview["booked_recommendations"])
                print("[preview] scheduled vehicles:", preview["scheduled_vehicles"])

                if not args.yes:
                    print("[dry-run] No data changed. Re-run with --yes to apply reset.")
                    return

                summary = _apply(cursor)
                print("[applied] deleted bookings:", summary["deleted_bookings"])
                print("[applied] updated recommendations:", summary["updated_recommendations"])
                print("[applied] normalized vehicles:", summary["normalized_vehicles"])
    finally:
        conn.close()


if __name__ == "__main__":
    main()
