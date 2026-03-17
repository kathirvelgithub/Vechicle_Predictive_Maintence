from app.agents.state import AgentState
from app.agents.llm_gateway import invoke_with_policy

def customer_node(state: AgentState) -> AgentState:
    print(f"🗣️ [Customer] Drafting notification for {state.get('vehicle_id')}...")
    
    # Get details from the graph state
    owner = state.get("vehicle_metadata", {}).get("owner", "Customer")
    model = state.get("vehicle_metadata", {}).get("model", "Vehicle")
    diagnosis = state.get("diagnosis_report", "Maintenance Required")
    priority = state.get("priority_level", "Medium")

    # ---------------------------------------------------------
    # 🔄 DYNAMIC PROMPT LOGIC (confirmation-first for all priorities)
    # ---------------------------------------------------------
    if priority == "Critical":
        instruction = "This is a CRITICAL safety alert. Ask them to reply YES to confirm service booking or NO to decline."
    else:
        instruction = "Advise them to schedule a repair soon. Ask them to reply YES to confirm booking or NO to decline."

    # Prompt the AI to write a message
    prompt = f"""
    You are a Service Advisor at a Truck Dealership.
    Write a short, professional text message to {owner}.
    
    Topic: Their {model} needs attention.
    Diagnosis Summary: {diagnosis}
    Priority: {priority}
    
    Action Required: {instruction}
    
    Constraint: Keep it under 50 words. Be direct.
    """

    try:
        # Call shared LLM gateway
        content, model_used = invoke_with_policy(prompt, profile="customer")
        state.setdefault("model_used_by_node", {})["customer_engagement"] = model_used
        state["customer_script"] = content
    except Exception as e:
        print(f"❌ Customer Agent LLM Error: {e}")
        state.setdefault("model_used_by_node", {})["customer_engagement"] = "error"
        # Fallback
        state["customer_script"] = f"Urgent: Your {model} requires service. Please contact us."

    # Customer decision remains pending until explicit YES/NO arrives via confirmation endpoints.
    state["customer_decision"] = state.get("customer_decision") or "PENDING_CONFIRMATION"
    
    return state