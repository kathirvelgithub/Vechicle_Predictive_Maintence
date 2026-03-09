from app.ueba.policies import check_permission
from app.ueba.storage import log_event

def secure_call(agent_name: str, service_name: str, func, *args, **kwargs):
    """
    The Gatekeeper. 
    1. Checks if Agent is allowed to use Service.
    2. Logs the attempt.
    3. Executes function if allowed.
    """
    # 1. Check Policy
    if check_permission(agent_name, service_name):
        # 2. Log Success
        log_event(agent_name, service_name, "ALLOWED")
        
        # 3. Execute the actual function
        try:
            return func(*args, **kwargs)
        except Exception as e:
            log_event(agent_name, service_name, "ERROR", str(e))
            raise e
    else:
        # Blocked!
        log_event(agent_name, service_name, "BLOCKED", "Permission Denied")
        raise PermissionError(f"Security Alert: {agent_name} is not authorized to use {service_name}")