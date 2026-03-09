import re
import os
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv

# Import your AgentState definition
from app.agents.state import AgentState

# ✅ IMPORT KNOWLEDGE BASE UTILITY
try:
    from app.utils.knowledge import find_diagnosis_steps
except ImportError:
    print("⚠️ Warning: app.utils.knowledge not found. RAG disabled.")
    def find_diagnosis_steps(x): return []

load_dotenv()

# ✅ SETUP: Fetch Key & Initialize LLM
groq_api_key = os.getenv("GROQ_API_KEY")

if not groq_api_key:
    print("❌ ERROR: GROQ_API_KEY not found in .env file")

llm = ChatOpenAI(
    model="llama-3.3-70b-versatile",
    base_url="https://api.groq.com/openai/v1",
    api_key=groq_api_key
)

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
    
    Vehicle: {state.get('vehicle_metadata', {}).get('model', 'Unknown Model')}
    Issues Detected: {issues}
    
    Telematics Data:
    - Oil Pressure: {oil_psi} psi
    - Engine Temp: {eng_temp} C
    
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
    """

    # 5. Call LLM
    try:
        response = llm.invoke([HumanMessage(content=prompt)])
        content = response.content
    except Exception as e:
        print(f"❌ Diagnosis Agent LLM Error: {e}")
        content = f"Error generating diagnosis: {str(e)}"
        state["priority_level"] = "High" # Default to High on error to be safe
        state["diagnosis_report"] = content
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