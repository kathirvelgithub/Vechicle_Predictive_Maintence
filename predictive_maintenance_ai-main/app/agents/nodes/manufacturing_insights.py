from langchain_core.messages import HumanMessage
from app.agents.state import AgentState
import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

load_dotenv()

# ✅ UPDATED: Fetch Key from Environment & Use Groq
# This reads 'GROQ_API_KEY' from your .env file
groq_api_key = os.getenv("GROQ_API_KEY")

if not groq_api_key:
    print("❌ ERROR: GROQ_API_KEY not found in .env file")

llm = ChatOpenAI(
    model="llama-3.3-70b-versatile",
    base_url="https://api.groq.com/openai/v1",
    api_key=groq_api_key
)

def manufacturing_node(state: AgentState) -> AgentState:
    """
    Worker 5: The Engineer.
    Analyzes the diagnosis to suggest long-term product improvements (CAPA).
    """
    print("🏭 [Manufacturing] Analyzing failure for fleet-wide patterns...")

    # 1. Skip if no critical diagnosis exists or risk is low
    if not state.get("diagnosis_report") or state.get("priority_level") == "Low":
        state["manufacturing_recommendations"] = "No critical design flaws detected."
        return state

    # 2. Input Data
    diagnosis = state["diagnosis_report"]
    vehicle_meta = state.get('vehicle_metadata') or {}
    model = vehicle_meta.get('model', 'Unknown Model')

    # 3. PROMPT: Force the AI to use Markdown Structure
    prompt = f"""
    You are a Senior Automotive Product Engineer.
    A critical failure occurred in the **{model}**.
    
    Diagnosis Report:
    {diagnosis}

    TASK: Propose a "Corrective and Preventive Action" (CAPA) plan for the engineering team.
    
    IMPORTANT: Format your response EXACTLY like this template. Use Markdown headers and bullets.

    ### 🏭 Design Flaw Analysis
    * **Vulnerability:** [What specific part of the design failed?]
    * **Root Cause:** [Why did it fail? e.g., lack of redundancy, poor material]

    ### 🔧 Engineering Fix (CAPA)
    * **Hardware Upgrade:** [e.g., Replace plastic pump impellers with brass]
    * **Sensor Logic:** [e.g., Add cross-validation between oil/temp sensors]
    * **Fail-Safe Mechanism:** [e.g., Auto-shutdown if Temp > 120°C]

    ### 🧪 Validation Plan
    * **Testing:** [e.g., Run HIL simulation for 500 hours]
    * **Expected Result:** [e.g., Reduce field failure rate by 80%]
    """

    # 4. Call LLM
    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        content = response.content
        print("✅ [Manufacturing] CAPA Report Generated.")
    except Exception as e:
        print(f"❌ Manufacturing Agent Error: {e}")
        content = "Could not generate engineering report."

    # 5. Save to State
    state["manufacturing_recommendations"] = content
    
    return state