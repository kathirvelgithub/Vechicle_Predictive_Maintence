import re

# Import your AgentState definition
from app.agents.state import AgentState
from app.agents.llm_gateway import invoke_with_policy
from app.domain.diagnosis_rules import generate_rule_based_diagnosis

# ✅ IMPORT KNOWLEDGE BASE UTILITY
try:
    from app.utils.knowledge import find_diagnosis_steps
except ImportError:
    print("⚠️ Warning: app.utils.knowledge not found. RAG disabled.")
    def find_diagnosis_steps(x): return []

def diagnosis_node(state: AgentState) -> AgentState:
    """
    Worker 2: Uses LLM to explain the issue, assess risk, and recommend action.
    """
    v_id = state.get("vehicle_id", "Unknown")
    print(f"🧠 [Diagnosis] LLM analyzing failure patterns for {v_id}...")

    # 1. Safe Data Extraction
    telematics = state.get("telematics_data", {})
    
    # Helper to safely get numbers (handles None/Null from DB)
    def safe_get(key, default=0):
        val = telematics.get(key)
        try:
            return float(val) if val is not None else default
        except (ValueError, TypeError):
            return default

    eng_temp = safe_get('engine_temp_c', 0)
    oil_psi = safe_get('oil_pressure_psi', 50) # Default to healthy 50 if missing
    vehicle_metadata = state.get("vehicle_metadata") or {}
    hybrid_risk_score = state.get("risk_score", 0)
    hybrid_risk_level = str(state.get("risk_level", "LOW")).upper()
    rule_risk_score = state.get("rule_risk_score", hybrid_risk_score)
    rule_risk_level = str(state.get("rule_risk_level", hybrid_risk_level)).upper()
    ml_risk_score = state.get("ml_risk_score")
    risk_model_used = state.get("risk_model_used", "rules-only")

    # 2. Prepare Issues List
    detected = state.get("detected_issues", [])
    if isinstance(detected, list):
        issues = "\n".join(detected)
    else:
        issues = str(detected)

    # Fallback for demo data cleanliness
    if not issues or issues == "None" or issues == "[]":
        issues = "Minor sensor drift detected (Simulated)"

    # 3. 🔍 RAG LOGIC: Retrieve Manuals
    expert_advice = ""
    search_terms = []

    if "Temp" in issues or eng_temp > 100:
        search_terms.append("overheating")
    if "Oil" in issues or oil_psi < 20:
        search_terms.append("oil")
    
    # If explicit DTC codes exist in telematics, search for them too
    dtc_codes = telematics.get("active_dtc_codes", [])
    if dtc_codes:
        search_terms.extend(dtc_codes)

    for term in search_terms:
        # Ensure term is a string before searching
        steps = find_diagnosis_steps(str(term))
        if steps:
            expert_advice += f"\n--- MANUAL ENTRY FOR '{str(term).upper()}' ---\n"
            for s in steps[:3]: 
                expert_advice += f"Part: {s.get('part', 'Unknown')}\nSteps: {s.get('steps', 'Check manual')}\n"

    if not expert_advice:
        expert_advice = "Standard maintenance protocols apply. Refer to general service guidelines."

    # 4. ✅ PROMPT ENGINEERING
    prompt = f"""
    You are a Senior Fleet Mechanic AI. 
    Analyze this truck's status based on the Telematics and the Service Manual provided.
    
    Vehicle: {vehicle_metadata.get('model', 'Unknown Model')}
    Issues Detected: {issues}
    
    Telematics Data:
    - Oil Pressure: {oil_psi} psi
    - Engine Temp: {eng_temp} C

    Risk Context:
    - Hybrid Risk Score: {hybrid_risk_score}/100 ({hybrid_risk_level})
    - Rule Guardrail Score: {rule_risk_score}/100 ({rule_risk_level})
    - ML Calibrated Score: {ml_risk_score if ml_risk_score is not None else 'Unavailable'}
    - Risk Model Source: {risk_model_used}
    
    📘 OFFICIAL SERVICE MANUAL GUIDELINES:
    {expert_advice}
    
    IMPORTANT: Format your response EXACTLY like this template. Do not add conversational filler.
    
    ### 🚨 Issue Summary
    * **Issue**: {issues}
    
    ### 📉 Root Cause Analysis
    * **Primary Cause**: [One sentence technical explanation]
    
    ### 🛠️ Immediate Action Plan
    1. [Step 1]
    2. [Step 2]
    
    ### ⚠️ Risk Assessment
    * **Severity**: [Critical / High / Medium / Low]

    Guardrail Rule: Do not output a severity lower than {rule_risk_level}.
    """

    # 5. Call LLM
    try:
        content, model_used = invoke_with_policy(prompt, profile="diagnosis")
        if not str(content or "").strip():
            raise ValueError("empty_diagnosis_response")
        state.setdefault("model_used_by_node", {})["diagnosis"] = model_used
        state["diagnosis_source"] = "llm"
        state["fallback_reason"] = None
    except Exception as e:
        print(f"❌ Diagnosis Agent LLM Error: {e}")
        fallback = generate_rule_based_diagnosis(
            vehicle_id=v_id,
            telematics_data=telematics,
            detected_issues=state.get("detected_issues"),
        )

        state.setdefault("model_used_by_node", {})["diagnosis"] = "rules-fallback"
        state["diagnosis_report"] = fallback["diagnosis_report"]
        state["recommended_action"] = fallback["recommended_action"]
        state["priority_level"] = fallback["priority_level"]

        if not state.get("detected_issues"):
            state["detected_issues"] = fallback["detected_issues"]

        try:
            existing_risk_score = int(float(state.get("risk_score") or 0))
        except (TypeError, ValueError):
            existing_risk_score = 0

        if existing_risk_score <= 0:
            state["risk_score"] = fallback["risk_score"]

        current_risk_level = str(state.get("risk_level") or "").strip().upper()
        if (
            not current_risk_level
            or (
                existing_risk_score <= 0
                and current_risk_level == "LOW"
                and str(fallback.get("risk_level") or "LOW").upper() != "LOW"
            )
        ):
            state["risk_level"] = fallback["risk_level"]

        state["error_message"] = f"diagnosis_llm_failed: {e.__class__.__name__}"
        state["diagnosis_source"] = "rules_fallback"
        state["fallback_reason"] = f"diagnosis_llm_failed:{e.__class__.__name__}"
        state.setdefault("node_statuses", {})["diagnosis"] = "fallback_rules"
        return state

    # 6. Save Report to State
    state["diagnosis_report"] = content

    # 7. 🔍 ROBUST PRIORITY PARSING (Regex)
    # Looks for "Severity" followed by colon, optional bolding (**), and the keyword
    priority_match = re.search(r"Severity\s*:?\s*\**\s*(Critical|High|Medium|Low)", content, re.IGNORECASE)
    
    if priority_match:
        found_priority = priority_match.group(1).capitalize()
        state["priority_level"] = found_priority
    else:
        # Fallback logic based on keywords if regex fails
        if "Critical" in content:
            state["priority_level"] = "Critical"
        elif "High" in content:
            state["priority_level"] = "High"
        else:
            state["priority_level"] = "Medium"

    # 7b. Enforce rule guardrail at runtime (do not allow lower severity than rule risk level)
    severity_rank = {
        "LOW": 1,
        "MEDIUM": 2,
        "HIGH": 3,
        "CRITICAL": 4,
    }

    llm_level = str(state.get("priority_level") or "Medium").upper()
    guardrail_level = str(rule_risk_level or "LOW").upper()
    if severity_rank.get(llm_level, 2) < severity_rank.get(guardrail_level, 1):
        state["priority_level"] = guardrail_level.capitalize()
        existing_reason = str(state.get("fallback_reason") or "").strip()
        guardrail_reason = "severity_clamped_to_rule_guardrail"
        state["fallback_reason"] = f"{existing_reason} | {guardrail_reason}" if existing_reason else guardrail_reason

    # 8. Extract Recommended Action (First line of Action Plan)
    # This helps downstream agents (like sending an SMS) without sending the whole paragraph
    try:
        action_match = re.search(r"### 🛠️ Immediate Action Plan\s*\n\d+\.\s*(.*)", content)
        if action_match:
            state["recommended_action"] = action_match.group(1).strip()
        else:
            state["recommended_action"] = "Inspect vehicle immediately."
    except Exception:
        state["recommended_action"] = "Check full diagnosis report."

    print(f"📊 [Diagnosis] Priority: {state['priority_level']} | Action: {state.get('recommended_action')}")

    return state