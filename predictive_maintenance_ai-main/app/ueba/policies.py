ACCESS_CONTROL_MATRIX = {
    # 1. Analyzer (Read Only)
    "DataAnalysisAgent": {
        "allowed_services": ["TelematicsRepo", "VehicleRepo"],
        "risk_limit": "LOW" 
    },
    
    # 2. Diagnostician (AI Logic)
    "DiagnosisAgent": {
        "allowed_services": ["LLM_Inference"],
        "risk_limit": "MEDIUM"
    },
    
    # 3. Customer Service (Can draft messages)
    "CustomerEngagementAgent": {
        "allowed_services": ["LLM_Inference"],
        "risk_limit": "LOW"
    },
    
    # 4. Scheduler (Can write/book slots - High Risk!)
    "SchedulingAgent": {
        "allowed_services": ["SchedulerService"],
        "risk_limit": "HIGH"
    }
}

def check_permission(agent_name: str, service_name: str) -> bool:
    policy = ACCESS_CONTROL_MATRIX.get(agent_name)
    if not policy:
        return False
    return service_name in policy["allowed_services"]