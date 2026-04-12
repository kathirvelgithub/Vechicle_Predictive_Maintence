from typing import TypedDict, List, Optional, Dict, Any

class AgentState(TypedDict):
    # --- 0. ORCHESTRATION METADATA ---
    run_id: str
    trigger_source: str
    orchestration_route: str
    route_reason: str
    execution_started_at: Optional[str]
    execution_finished_at: Optional[str]
    node_statuses: Dict[str, str]
    node_latency_ms: Dict[str, int]
    model_used_by_node: Dict[str, str]
    execution_plan: Optional[Dict[str, Any]]
    plan_confidence: Optional[float]
    verification_status: Optional[str]
    verification_notes: Optional[List[str]]
    requires_human_review: bool
    historical_context: Optional[Dict[str, Any]]
    memory_context_summary: Optional[str]
    escalation_reason: Optional[str]
    escalation_level: Optional[str]

    # --- 1. CORE INPUTS ---
    vehicle_id: str
    vin: Optional[str]  # ✅ Added: Critical for Database Lookups
    vehicle_metadata: Optional[Dict[str, Any]]
    telematics_data: Optional[Dict[str, Any]]
    
    # --- 2. ANALYSIS LAYER ---
    risk_score: int
    risk_level: str             # LOW, MEDIUM, HIGH, CRITICAL
    detected_issues: List[str]
    rule_risk_score: Optional[int]
    rule_risk_level: Optional[str]
    ml_risk_score: Optional[int]
    risk_model_used: Optional[str]
    
    # --- 3. DIAGNOSIS LAYER ---
    diagnosis_report: str
    diagnosis_source: Optional[str]
    fallback_reason: Optional[str]
    recommended_action: str
    priority_level: str
    
    # --- 4. CUSTOMER LAYER ---
    customer_script: str
    customer_decision: str      # "BOOKED", "YES", "CONFIRMED", "PENDING_CONFIRMATION", "DEFERRED", "REJECTED"
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