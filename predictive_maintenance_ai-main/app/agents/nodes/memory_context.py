from datetime import datetime, timedelta
from typing import Any, Dict, List

from app.agents.state import AgentState
from database import execute_query


def _serialize_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    serialized = []
    for row in rows or []:
        payload = dict(row)
        for key, value in list(payload.items()):
            if isinstance(value, datetime):
                payload[key] = value.isoformat()
        serialized.append(payload)
    return serialized


def memory_context_node(state: AgentState) -> AgentState:
    vehicle_id = str(state.get("vehicle_id") or "").strip()
    print(f"[Memory] Retrieving historical context for {vehicle_id}...")

    if not vehicle_id:
        state["historical_context"] = {"vehicle_id": None, "summary": "No vehicle_id available"}
        state["memory_context_summary"] = "No memory context available"
        state.setdefault("model_used_by_node", {})["memory_context"] = "rules"
        return state

    window_days = 30
    start_ts = datetime.utcnow() - timedelta(days=window_days)

    analyses = execute_query(
        """
        SELECT analysis_timestamp, risk_score, risk_level, recommended_action, priority_level,
               booking_id, error_message
        FROM ai_analysis_results
        WHERE vehicle_id = %s
          AND analysis_timestamp >= %s
        ORDER BY analysis_timestamp DESC
        LIMIT 15
        """,
        (vehicle_id, start_ts),
        fetch=True,
    )

    recommendations = execute_query(
        """
        SELECT recommendation_id, status, risk_score, priority, reason, created_at,
               customer_confirmation_status, customer_confirmation_method
        FROM service_recommendations
        WHERE vehicle_id = %s
          AND created_at >= %s
        ORDER BY created_at DESC
        LIMIT 10
        """,
        (vehicle_id, start_ts),
        fetch=True,
    )

    bookings = execute_query(
        """
        SELECT booking_id, scheduled_date, status, priority, service_type
        FROM service_bookings
        WHERE vehicle_id = %s
          AND scheduled_date >= %s
        ORDER BY scheduled_date DESC
        LIMIT 10
        """,
        (vehicle_id, start_ts),
        fetch=True,
    )

    analysis_rows = _serialize_rows(analyses)
    recommendation_rows = _serialize_rows(recommendations)
    booking_rows = _serialize_rows(bookings)

    high_risk_count = sum(
        1
        for row in analysis_rows
        if str(row.get("risk_level") or "").upper() in {"HIGH", "CRITICAL"}
    )
    pending_confirmation_count = sum(
        1
        for row in recommendation_rows
        if str(row.get("status") or "") == "pending_customer_confirmation"
    )

    summary = (
        f"Last {window_days}d: {len(analysis_rows)} analyses, {high_risk_count} high/critical, "
        f"{len(recommendation_rows)} recommendations, {pending_confirmation_count} pending confirmation, "
        f"{len(booking_rows)} bookings"
    )

    state["historical_context"] = {
        "vehicle_id": vehicle_id,
        "window_days": window_days,
        "analysis_count": len(analysis_rows),
        "high_risk_count": high_risk_count,
        "recommendation_count": len(recommendation_rows),
        "pending_confirmation_count": pending_confirmation_count,
        "booking_count": len(booking_rows),
        "recent_analyses": analysis_rows,
        "recent_recommendations": recommendation_rows,
        "recent_bookings": booking_rows,
    }
    state["memory_context_summary"] = summary
    state.setdefault("model_used_by_node", {})["memory_context"] = "rules"
    return state
