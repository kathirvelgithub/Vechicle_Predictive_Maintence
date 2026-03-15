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
    # 🔄 DYNAMIC PROMPT LOGIC (Based on Priority)
    # ---------------------------------------------------------
    if priority == "Critical":
        # Case 1: Critical - Inform them about Auto-Booking
        instruction = "This is a CRITICAL safety alert. Inform them that a service slot is being auto-scheduled immediately to prevent failure."
    else:
        # Case 2: Normal - Ask for permission
        instruction = "Advise them to schedule a repair soon. Ask them to reply 'YES' to confirm a booking for tomorrow."

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

    # ---------------------------------------------------------
    # 🎭 DEMO SIMULATION: USER DECISION
    # ---------------------------------------------------------
    if priority == "Critical":
        print(f"🚨 [Customer] Critical Alert Sent. System assuming Authorization.")
        state["customer_decision"] = "AUTO_AUTHORIZED"
    else:
        # For Demo purposes, we simulate the user saying "YES" (BOOKED).
        # In a real app, you would wait for an SMS reply here.
        print(f"📞 [Customer] Message sent. Simulating user reply: 'YES, please book.'")
        state["customer_decision"] = "BOOKED" 
    
    return state