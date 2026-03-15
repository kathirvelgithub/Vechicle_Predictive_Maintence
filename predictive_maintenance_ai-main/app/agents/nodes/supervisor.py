from datetime import datetime, timezone
import uuid

from app.agents.state import AgentState
from app.domain.risk_rules import calculate_risk_score


def _safe_int(value, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def supervisor_node(state: AgentState) -> AgentState:
    """
    Rules-based supervisor for Phase 1 orchestration.
    Chooses one of three routes:
      - observe_only: low-risk records, skip expensive LLM stages
      - diagnosis_only: medium-risk records, stop after diagnosis
      - full_pipeline: high/critical records, run full workflow
    """
    if not state.get("run_id"):
        state["run_id"] = f"run-{uuid.uuid4().hex[:12]}"

    if not state.get("execution_started_at"):
        state["execution_started_at"] = datetime.now(timezone.utc).isoformat()

    state.setdefault("trigger_source", "api_predictive_run")
    state.setdefault("node_statuses", {})
    state.setdefault("node_latency_ms", {})
    state.setdefault("model_used_by_node", {})
    state["model_used_by_node"]["supervisor"] = "rules"

    risk_score = _safe_int(state.get("risk_score"), 0)
    telematics = state.get("telematics_data") or {}
    detected_issues = state.get("detected_issues") or []

    # Ensure we can route even when upstream inputs are partial.
    if risk_score <= 0 and telematics:
        assessment = calculate_risk_score(telematics)
        state["risk_score"] = assessment["score"]
        state["risk_level"] = assessment["level"]
        state["detected_issues"] = assessment["reasons"]

    risk_level = str(state.get("risk_level", "LOW")).upper()

    if risk_level == "LOW" and not detected_issues:
        state["orchestration_route"] = "observe_only"
        state["route_reason"] = "Low risk with no active issues; monitor only"
        state["diagnosis_report"] = (
            state.get("diagnosis_report")
            or "No urgent issue detected. Continue live monitoring and routine checks."
        )
        state["recommended_action"] = state.get("recommended_action") or "Continue monitoring"
        state["priority_level"] = state.get("priority_level") or "Low"
        return state

    if risk_level in {"MEDIUM", "WATCH"}:
        state["orchestration_route"] = "diagnosis_only"
        state["route_reason"] = "Medium risk; run diagnosis and defer downstream actions"
        return state

    state["orchestration_route"] = "full_pipeline"
    state["route_reason"] = "High or critical risk; run full response workflow"
    return state
