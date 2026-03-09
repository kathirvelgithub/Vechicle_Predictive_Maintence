import json
import os

# Load the JSON data
KB_PATH = os.path.join(os.path.dirname(__file__), "../knowledge_base.json")

def load_knowledge_base():
    with open(KB_PATH, "r") as f:
        return json.load(f)

def find_diagnosis_steps(symptom_keyword: str):
    """
    Searches the Knowledge Base for parts related to a symptom.
    Example: Input 'overheating' -> Returns steps for Radiator, Water Pump, etc.
    """
    kb = load_knowledge_base()
    relevant_steps = []

    for item in kb:
        # Check if the symptom keyword exists in the item's symptom list
        if any(symptom_keyword.lower() in s.lower() for s in item["symptoms"]):
            relevant_steps.append({
                "part": item["subcategory"],
                "steps": item["diagnosis_steps"]
            })
    
    return relevant_steps