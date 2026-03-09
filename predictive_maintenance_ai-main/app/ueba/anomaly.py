# File: app/ueba/anomaly.py

import logging

# Setup a logger for security events
logger = logging.getLogger("UEBA_Security")

def detect_anomaly(user_id: str, action: str, metadata: dict = None) -> bool:
    """
    Analyzes user behavior to detect anomalies.
    
    Args:
        user_id (str): The ID of the user performing the action.
        action (str): The specific action being performed (e.g., "predictive_maintenance_request").
        metadata (dict): Contextual data (IP address, timestamp, payload size).
        
    Returns:
        bool: True if behavior is anomalous (block request), False if normal (allow request).
    """
    if metadata is None:
        metadata = {}

    # --- HACKATHON LOGIC: SIMULATION ---
    # For now, we assume all traffic is safe unless explicitly flagged.
    # You can add logic here later (e.g., check if IP is from a weird location).
    
    logger.info(f"[UEBA CHECK] User: {user_id} | Action: {action} | Status: NORMAL")
    
    # Return False means "No Anomaly Detected" -> Allow the request
    return False