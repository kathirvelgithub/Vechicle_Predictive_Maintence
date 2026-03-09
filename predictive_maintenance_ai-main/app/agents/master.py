from langgraph.graph import StateGraph, END, START
from app.agents.state import AgentState

# --- IMPORT NODES (With Fallbacks) ---
try:
    from app.agents.nodes.data_analysis import data_analysis_node
except ImportError:
    raise ImportError("❌ 'data_analysis_node' missing. Check database connection.")

try:
    from app.agents.nodes.diagnosis import diagnosis_node
except ImportError:
    raise ImportError("❌ 'diagnosis_node' missing.")

try:
    from app.agents.nodes.customer_engagement import customer_node
except ImportError:
    def customer_node(state): return state

try:
    from app.agents.nodes.scheduling import scheduling_node
except ImportError:
    def scheduling_node(state): return state

try:
    from app.agents.nodes.voice_agent import voice_interaction_node
except ImportError:
    def voice_interaction_node(state): return state

try:
    from app.agents.nodes.feedback import feedback_node
except ImportError:
    def feedback_node(state): return state

try:
    from app.agents.nodes.manufacturing_insights import manufacturing_node
except ImportError:
    def manufacturing_node(state): return state

# ==========================================
# BUILD THE GRAPH
# ==========================================
def build_graph():
    workflow = StateGraph(AgentState)

    # Add Nodes
    workflow.add_node("data_analysis", data_analysis_node)
    workflow.add_node("diagnosis", diagnosis_node)
    workflow.add_node("customer_engagement", customer_node)
    workflow.add_node("voice_interaction", voice_interaction_node) # 🎙️ Added Voice
    workflow.add_node("scheduling", scheduling_node)
    workflow.add_node("feedback", feedback_node)
    workflow.add_node("manufacturing", manufacturing_node)

    # Define Edges (Logic Flow)
    workflow.add_edge(START, "data_analysis")
    workflow.add_edge("data_analysis", "diagnosis")
    workflow.add_edge("diagnosis", "customer_engagement")
    
    # Parallel/Fork: Voice or Text? 
    # For simplicity, we run Voice -> Scheduler
    workflow.add_edge("customer_engagement", "voice_interaction")
    workflow.add_edge("voice_interaction", "scheduling")
    
    workflow.add_edge("scheduling", "feedback")
    workflow.add_edge("feedback", "manufacturing")
    workflow.add_edge("manufacturing", END)

    return workflow.compile()

master_agent = build_graph()


def run_predictive_flow(vehicle_id: str) -> dict:
    """
    Convenience wrapper for Streamlit UI and other callers.
    Builds the initial state and runs the full multi-agent graph.
    """
    initial_state = {
        "vehicle_id": vehicle_id,
        "vin": None,
        "vehicle_metadata": None,
        "telematics_data": None,
        "detected_issues": [],
        "risk_score": 0,
        "risk_level": "LOW",
        "diagnosis_report": "",
        "recommended_action": "Wait",
        "priority_level": "Low",
        "customer_script": "",
        "customer_decision": "PENDING",
        "voice_transcript": [],
        "selected_slot": None,
        "booking_id": None,
        "scheduled_date": None,
        "audio_url": None,
        "audio_available": False,
        "manufacturing_recommendations": "",
        "feedback_request": None,
        "error_message": None,
        "ueba_alert_triggered": False,
    }
    return master_agent.invoke(initial_state)