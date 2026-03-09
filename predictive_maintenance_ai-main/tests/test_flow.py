import sys
import os

# Add project root to python path so imports work
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.agents.master import run_predictive_flow

# 1. Select a target vehicle (V-101 is the broken one in our fake data)
target_vehicle = "V-101"

# 2. Run the AI
try:
    result = run_predictive_flow(target_vehicle)
    
    print("\n" + "="*50)
    print("✅ MISSION COMPLETE")
    print("="*50)
    print(f"🚛 Vehicle:   {target_vehicle}")
    print(f"⚠️ Risk Level: {result.get('risk_level')}")
    print(f"📈 Score:      {result.get('risk_score')}/100")
    print("-" * 50)
    print("📝 DIAGNOSIS REPORT:")
    print(result.get("diagnosis_report"))
    print("-" * 50)
    print(f"🔧 ACTION:     {result.get('recommended_action')}")
    print(f"🚨 PRIORITY:   {result.get('priority_level')}")
    print("="*50 + "\n")

except Exception as e:
    print(f"❌ FLOW FAILED: {e}")