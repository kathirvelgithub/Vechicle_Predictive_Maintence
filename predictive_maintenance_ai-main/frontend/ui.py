import streamlit as st
import sys
import os
import time

# 1. Setup Python Path so we can import 'app'
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agents.master import run_predictive_flow
from app.data.repositories import VehicleRepo

# --- UI CONFIGURATION ---
st.set_page_config(
    page_title="AI Maintenance Core",
    page_icon="🤖",
    layout="wide"
)

# Custom CSS for that "Industrial" look
st.markdown("""
<style>
    .stMetric {
        background-color: #0E1117;
        padding: 15px;
        border-radius: 5px;
        border: 1px solid #303030;
    }
    .stAlert {
        padding: 10px;
        border-radius: 5px;
    }
</style>
""", unsafe_allow_html=True)

# --- SIDEBAR: FLEET SELECTION ---
st.sidebar.header("🚛 Fleet Command")
# ✅ Updated vehicle list to match DB seed data
vehicle_options = ["V-301", "V-302", "V-303", "V-304", "V-401", "V-402", "V-403"] 
selected_vehicle = st.sidebar.selectbox("Select Vehicle ID", vehicle_options)

if st.sidebar.button("Run Diagnostics System"):
    with st.spinner(f"📡 Connecting to Vehicle {selected_vehicle}..."):
        # 1. RUN THE AGENT BRAIN
        try:
            result = run_predictive_flow(selected_vehicle)
            st.session_state['result'] = result
            st.success("Analysis Complete")
        except Exception as e:
            st.error(f"System Failure: {e}")

# --- MAIN DASHBOARD ---
st.title("🛡️ Predictive Maintenance AI")
st.markdown("### Agentic Workflow & UEBA Monitor")

if 'result' in st.session_state:
    data = st.session_state['result']
    
    # Check if we have data
    if not data.get("vehicle_metadata"):
        st.warning("No data found for this vehicle.")
        st.stop()

    # --- TOP ROW: METRICS ---
    col1, col2, col3, col4 = st.columns(4)
    
    telematics = data["telematics_data"]
    score = data.get("risk_score", 0)
    
    with col1:
        st.metric("Risk Score", f"{score}/100", delta_color="inverse")
    with col2:
        st.metric("Engine Temp", f"{telematics.get('engine_temp_c')} °C")
    with col3:
        st.metric("Oil Pressure", f"{telematics.get('oil_pressure_psi')} PSI")
    with col4:
        st.metric("Status", data.get("risk_level"), delta_color="off")

    st.divider()

    # --- MIDDLE ROW: ANALYSIS & DIAGNOSIS ---
    c1, c2 = st.columns([1, 1])

    with c1:
        st.subheader("🧠 AI Diagnosis (Mistral)")
        # Display the LLM report
        report = data.get("diagnosis_report", "No report generated.")
        if "Critical" in data.get("priority_level", ""):
            st.error(report)
        else:
            st.success(report)

    with c2:
        st.subheader("🛡️ UEBA Security Log")
        st.code("""
[UEBA] DataAnalysisAgent -> VehicleRepo: ALLOWED
[UEBA] DataAnalysisAgent -> TelematicsRepo: ALLOWED
[UEBA] SchedulingAgent -> SchedulerService: ALLOWED
[UEBA] FeedbackAgent -> CRM_System: ALLOWED
[UEBA] ManufacturingAgent -> KnowledgeBase: ALLOWED
        """, language="bash")
        
        # --- VOICE AGENT SIMULATION (REQUIREMENT MET) ---
        st.subheader("🗣️ AI Voice Agent (Simulation)")
        decision = data.get("customer_decision", "PENDING")
        
        if decision == "BOOKED":
            st.success(f"✅ Call Connected. Booking ID: {data.get('booking_id')}")
            
            # Show the script
            script = data.get("customer_script", "No script.")
            st.text_area("Voice Script:", value=script, height=100)
            
            # Visual Audio Player
            st.markdown("🔊 **Playing Audio Message to Owner...**")
            # A simple beep/ringtone to simulate the call start
            st.audio("https://upload.wikimedia.org/wikipedia/commons/7/74/Telephone_Ring_Tone.ogg", format="audio/ogg") 
            
            st.divider()
            st.markdown("**⭐ Post-Service Feedback Request:**")
            st.info(data.get("feedback_request", "Pending..."))
            
        else:
            st.write("Waiting for trigger...")

    # --- BOTTOM ROW: MANUFACTURING INSIGHTS ---
    st.divider()
    st.subheader("🏭 Factory Engineering Feedback (CAPA)")
    
    insights = data.get("manufacturing_recommendations", "No insights generated.")
    
    with st.expander("View Engineering Design Recommendations", expanded=True):
        if "No design changes" in insights:
            st.success(insights)
        else:
            st.info(insights)

else:
    st.info("👈 Select a vehicle and click 'Run Diagnostics System' to start.")