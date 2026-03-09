import os
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from app.agents.state import AgentState

# --- 1. LOAD ENVIRONMENT VARIABLES ---
load_dotenv() # This reads the .env file

# --- 2. FETCH KEY FROM ENV ---
groq_api_key = os.getenv("GROQ_API_KEY")

if not groq_api_key:
    # Stop the server or warn if the key is missing
    raise ValueError("❌ ERROR: GROQ_API_KEY is missing from .env file!")

# --- 3. SETUP GROQ LLM ---
llm = ChatOpenAI(
    model="llama-3.3-70b-versatile",
    base_url="https://api.groq.com/openai/v1",
    api_key=groq_api_key
)

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
        # Generate text using Groq
        response = llm.invoke([HumanMessage(content=prompt)])
        state["feedback_request"] = response.content
        print("✅ [Feedback] Follow-up generated successfully.")
        
    except Exception as e:
        print(f"❌ Feedback Agent Error: {e}")
        # Fallback text if LLM fails
        state["feedback_request"] = "How was your service? Please rate us 1-5."

    return state