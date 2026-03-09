import time
from typing import List, Dict

# In-memory log for this demo. 
# In production, this would be a database like Elasticsearch or Splunk.
EVENT_LOG: List[Dict] = []

def log_event(agent_name: str, action: str, status: str, details: str = ""):
    event = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "agent": agent_name,
        "action": action,
        "status": status, # "ALLOWED" or "BLOCKED"
        "details": details
    }
    EVENT_LOG.append(event)
    
    # Print to console so you can see it happening
    icon = "🛡️" if status == "ALLOWED" else "⛔"
    print(f"{icon} [UEBA] {agent_name} -> {action}: {status}")

def get_recent_events(limit=10):
    return EVENT_LOG[-limit:]