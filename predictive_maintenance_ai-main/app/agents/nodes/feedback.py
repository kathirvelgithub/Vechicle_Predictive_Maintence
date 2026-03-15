from app.agents.state import AgentState
from app.agents.llm_gateway import invoke_with_policy

def feedback_node(state: AgentState) -> AgentState:
    print("⭐ [Feedback] Service completed. Requesting customer review...")
    
    # ✅ FIX: Check for 'booking_id' instead of 'customer_decision'
    # Since we are auto-booking in the demo, 'customer_decision' might be skipped.
    # But 'booking_id' will ALWAYS exist if scheduling succeeded.
    if not state.get("booking_id"):
        print("   -> No booking ID found, skipping feedback.")
        return state

    # Get owner name or default to 'Customer'
    owner = state.get("vehicle_metadata", {}).get("owner", "Customer")
    
    # Prompt for the post-service message
    prompt = f"""
    You are a Customer Experience AI.
    The customer {owner} just had their truck serviced after our urgent alert.
    
    Write a short, warm 'Post-Service Follow-up' script (Voice Style).
    Ask if the vehicle is running smoothly and request a satisfaction rating (1-5).
    """

    try:
        # Generate text using shared LLM gateway
        content, model_used = invoke_with_policy(prompt, profile="feedback")
        state.setdefault("model_used_by_node", {})["feedback"] = model_used
        state["feedback_request"] = content
        print("✅ [Feedback] Follow-up generated successfully.")
        
    except Exception as e:
        print(f"❌ Feedback Agent Error: {e}")
        state.setdefault("model_used_by_node", {})["feedback"] = "error"
        # Fallback text if LLM fails
        state["feedback_request"] = "How was your service? Please rate us 1-5."

    return state