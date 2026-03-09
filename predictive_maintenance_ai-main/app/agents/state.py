from typing import TypedDict, List, Optional, Dict, Any

class AgentState(TypedDict):
    # --- 1. CORE INPUTS ---
    vehicle_id: str
    vin: Optional[str]  # ✅ Added: Critical for Database Lookups
    vehicle_metadata: Optional[Dict[str, Any]]
    telematics_data: Optional[Dict[str, Any]]
    
    # --- 2. ANALYSIS LAYER ---
    risk_score: int
    risk_level: str             # LOW, MEDIUM, HIGH, CRITICAL
    detected_issues: List[str]
    
    # --- 3. DIAGNOSIS LAYER ---
    diagnosis_report: str
    recommended_action: str
    priority_level: str
    
    # --- 4. CUSTOMER LAYER ---
    customer_script: str
    customer_decision: str      # "BOOKED", "DEFERRED", "REJECTED"
    voice_transcript: Optional[List[Dict[str, str]]] 
    
    # --- 5. SCHEDULING LAYER ---
    selected_slot: Optional[str]
    booking_id: Optional[str]
    scheduled_date: Optional[str] # ✅ Added: For DB updates
    
    # --- 6. OUTPUTS ---
    audio_url: Optional[str]
    audio_available: bool
    manufacturing_recommendations: Optional[str]
    feedback_request: Optional[str]

    # --- 7. SYSTEM FLAGS ---
    error_message: Optional[str]
    ueba_alert_triggered: bool