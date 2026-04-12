import json

from app.agents.state import AgentState
from app.agents.llm_gateway import invoke_with_policy


def _fallback_plan(state: AgentState) -> dict:
    risk_level = str(state.get("risk_level") or "LOW").upper()
    priority = str(state.get("priority_level") or "Low")
    action = str(state.get("recommended_action") or "Inspect vehicle")
    route = str(state.get("orchestration_route") or "full_pipeline")

    base_steps = [
        "Validate latest telematics and diagnosis output",
        f"Prepare customer message with recommended action: {action}",
        "Collect explicit customer confirmation before any booking",
    ]

    if route == "observe_only":
        base_steps = [
            "Record low-risk observation",
            "Keep monitoring until new risk signal arrives",
        ]

    return {
        "objective": f"Handle {risk_level} risk event for {state.get('vehicle_id')}",
        "priority": priority,
        "route": route,
        "steps": base_steps,
        "risks": [
            "False-positive diagnosis may trigger unnecessary outreach",
            "Booking must not happen before explicit customer confirmation",
        ],
        "human_approval_required": risk_level in {"HIGH", "CRITICAL"},
        "confidence": 0.68,
        "generated_by": "planner.rules_fallback",
    }


def planner_node(state: AgentState) -> AgentState:
    print(f"[Planner] Building execution plan for {state.get('vehicle_id')}...")

    risk_level = str(state.get("risk_level") or "LOW").upper()
    route = str(state.get("orchestration_route") or "full_pipeline")
    diagnosis = str(state.get("diagnosis_report") or "No diagnosis report")
    action = str(state.get("recommended_action") or "Inspect vehicle")

    prompt = f"""
You are an AI workflow planner for fleet maintenance operations.
Create a concise JSON plan for this run.

Inputs:
- Vehicle: {state.get('vehicle_id')}
- Risk Level: {risk_level}
- Route: {route}
- Recommended Action: {action}
- Diagnosis: {diagnosis}

Hard policy:
- Never book service before explicit customer confirmation.
- For HIGH/CRITICAL risk, include human review readiness.

Return ONLY valid JSON with keys:
objective, priority, route, steps, risks, human_approval_required, confidence
"""

    try:
        content, model_used = invoke_with_policy(prompt, profile="default")
        state.setdefault("model_used_by_node", {})["planner"] = model_used

        cleaned = str(content or "").strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.replace("```json", "").replace("```", "").strip()

        plan = json.loads(cleaned)
        if not isinstance(plan, dict):
            raise ValueError("planner_response_not_dict")

        state["execution_plan"] = plan
        state["plan_confidence"] = float(plan.get("confidence") or 0.65)
        state["requires_human_review"] = bool(plan.get("human_approval_required", False))
        return state
    except Exception as exc:
        state.setdefault("model_used_by_node", {})["planner"] = "rules-fallback"
        state["execution_plan"] = _fallback_plan(state)
        state["plan_confidence"] = float(state["execution_plan"].get("confidence") or 0.6)
        state["requires_human_review"] = bool(state["execution_plan"].get("human_approval_required", False))
        existing_error = str(state.get("error_message") or "").strip()
        planner_error = f"planner_failed:{exc.__class__.__name__}"
        state["error_message"] = f"{existing_error} | {planner_error}" if existing_error else planner_error
        return state
