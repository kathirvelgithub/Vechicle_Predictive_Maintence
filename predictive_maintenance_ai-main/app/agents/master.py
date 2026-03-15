from datetime import datetime, timezone
import time

from langgraph.graph import StateGraph, END, START
from app.agents.state import AgentState

# --- IMPORT NODES (With Fallbacks) ---
try:
    from app.agents.nodes.data_analysis import data_analysis_node
except ImportError:
    raise ImportError("❌ 'data_analysis_node' missing. Check database connection.")

try:
    from app.agents.nodes.supervisor import supervisor_node
except ImportError:
    def supervisor_node(state):
        state["orchestration_route"] = "full_pipeline"
        state["route_reason"] = "Supervisor unavailable; default to full pipeline"
        return state

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


def _track_node(node_name, node_fn):
    def wrapped(state):
        started = time.perf_counter()
        state.setdefault("node_statuses", {})
        state.setdefault("node_latency_ms", {})
        state.setdefault("model_used_by_node", {})

        if node_name in {
            "diagnosis",
            "customer_engagement",
            "voice_interaction",
            "feedback",
            "manufacturing",
        }:
            state["model_used_by_node"].setdefault(node_name, "gateway_pending")
        else:
            state["model_used_by_node"].setdefault(node_name, "rules")

        try:
            next_state = node_fn(state)
            latency_ms = int((time.perf_counter() - started) * 1000)

            next_state.setdefault("node_statuses", {})
            next_state.setdefault("node_latency_ms", {})
            next_state["node_statuses"][node_name] = "ok"
            next_state["node_latency_ms"][node_name] = latency_ms

            if node_name == "manufacturing":
                next_state["execution_finished_at"] = datetime.now(timezone.utc).isoformat()

            return next_state
        except Exception as exc:
            latency_ms = int((time.perf_counter() - started) * 1000)
            state["node_statuses"][node_name] = f"error:{exc.__class__.__name__}"
            state["node_latency_ms"][node_name] = latency_ms
            state["error_message"] = str(exc)
            state["execution_finished_at"] = datetime.now(timezone.utc).isoformat()
            raise

    return wrapped


def _route_from_supervisor(state: AgentState) -> str:
    route = state.get("orchestration_route") or "full_pipeline"
    if route == "observe_only":
        state["execution_finished_at"] = datetime.now(timezone.utc).isoformat()
        return "observe_only"
    return "to_diagnosis"


def _route_after_diagnosis(state: AgentState) -> str:
    if state.get("orchestration_route") == "diagnosis_only":
        state["execution_finished_at"] = datetime.now(timezone.utc).isoformat()
        return "finish"
    return "continue"

# ==========================================
# BUILD THE GRAPH
# ==========================================
def build_graph():
    workflow = StateGraph(AgentState)

    # Add Nodes
    workflow.add_node("data_analysis", _track_node("data_analysis", data_analysis_node))
    workflow.add_node("supervisor", _track_node("supervisor", supervisor_node))
    workflow.add_node("diagnosis", _track_node("diagnosis", diagnosis_node))
    workflow.add_node("customer_engagement", _track_node("customer_engagement", customer_node))
    workflow.add_node("voice_interaction", _track_node("voice_interaction", voice_interaction_node))
    workflow.add_node("scheduling", _track_node("scheduling", scheduling_node))
    workflow.add_node("feedback", _track_node("feedback", feedback_node))
    workflow.add_node("manufacturing", _track_node("manufacturing", manufacturing_node))

    # Define Edges (Logic Flow)
    workflow.add_edge(START, "data_analysis")
    workflow.add_edge("data_analysis", "supervisor")

    workflow.add_conditional_edges(
        "supervisor",
        _route_from_supervisor,
        {
            "observe_only": END,
            "to_diagnosis": "diagnosis",
        },
    )

    workflow.add_conditional_edges(
        "diagnosis",
        _route_after_diagnosis,
        {
            "finish": END,
            "continue": "customer_engagement",
        },
    )
    
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
        "run_id": "",
        "trigger_source": "run_predictive_flow",
        "orchestration_route": "",
        "route_reason": "",
        "execution_started_at": None,
        "execution_finished_at": None,
        "node_statuses": {},
        "node_latency_ms": {},
        "model_used_by_node": {},
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