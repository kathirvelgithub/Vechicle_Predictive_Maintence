from app.agents.state import AgentState


def verifier_node(state: AgentState) -> AgentState:
    print(f"[Verifier] Validating workflow guardrails for {state.get('vehicle_id')}...")

    notes = []
    has_warning = False
    is_blocked = False

    risk_level = str(state.get("risk_level") or "LOW").upper()
    decision = str(state.get("customer_decision") or "").strip().upper()
    booking_id = state.get("booking_id")
    plan_confidence = float(state.get("plan_confidence") or 0.0)

    if not str(state.get("diagnosis_report") or "").strip() and str(state.get("orchestration_route") or "") == "full_pipeline":
        is_blocked = True
        notes.append("Missing diagnosis report in full_pipeline route")

    if booking_id and decision not in {"BOOKED", "YES", "CONFIRMED"}:
        is_blocked = True
        notes.append("Booking artifact detected without explicit customer confirmation")
        state["booking_id"] = None
        state["selected_slot"] = None
        state["scheduled_date"] = None

    if risk_level in {"HIGH", "CRITICAL"} and not str(state.get("customer_script") or "").strip():
        has_warning = True
        notes.append("High-risk run has no customer communication script")

    if str(state.get("error_message") or "").strip():
        has_warning = True
        notes.append("Upstream node reported an error; manual review recommended")

    # Confidence escalation: high/critical risk with weak planning confidence requires human review.
    if risk_level in {"HIGH", "CRITICAL"} and plan_confidence < 0.60:
        has_warning = True
        notes.append(
            f"Low planning confidence ({plan_confidence:.2f}) for {risk_level} risk; escalation required"
        )
        state["requires_human_review"] = True
        state["escalation_reason"] = "low_plan_confidence_high_risk"
        state["escalation_level"] = "critical_review" if risk_level == "CRITICAL" else "priority_review"

    if is_blocked:
        state["verification_status"] = "blocked"
        state["requires_human_review"] = True
        state["escalation_reason"] = state.get("escalation_reason") or "verification_blocked"
        state["escalation_level"] = state.get("escalation_level") or "critical_review"
        if not str(state.get("error_message") or "").strip():
            state["error_message"] = "verification_blocked"
    elif has_warning:
        state["verification_status"] = "warning"
        state["requires_human_review"] = bool(state.get("requires_human_review") or risk_level in {"HIGH", "CRITICAL"})
        if state.get("requires_human_review") and not state.get("escalation_reason"):
            state["escalation_reason"] = "verifier_warning_requires_review"
            state["escalation_level"] = "priority_review" if risk_level in {"HIGH", "CRITICAL"} else "standard_review"
    else:
        state["verification_status"] = "passed"
        state["requires_human_review"] = bool(state.get("requires_human_review") or False)

    state["verification_notes"] = notes
    state.setdefault("model_used_by_node", {})["verifier"] = "rules"
    return state
