import os
import google.generativeai as genai
from dotenv import load_dotenv

# 1. Load the key
load_dotenv()
api_key = os.getenv("GOOGLE_API_KEY")

if not api_key:
    print("❌ GOOGLE_API_KEY not found in .env")
else:
    # 2. Configure the SDK
    genai.configure(api_key=api_key)
    
    print("🔍 Listing available models for your key...")
    try:
        # 3. List all models that support text generation ('generateContent')
        found_any = False
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                print(f"✅ FOUND: {m.name}")
                found_any = True
        
        if not found_any:
            print("⚠️ No models found. Check if your API key has permissions.")
            
    except Exception as e:
        print(f"❌ Error listing models: {e}")