import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

# 1. Load environment variables
load_dotenv()

# 2. Initialize ChatOpenAI pointing to OpenRouter
# We explicitly set the base_url here to be safe, though .env often handles it.
llm = ChatOpenAI(
    model="mistralai/devstral-2512:free",
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENAI_API_KEY")
)

# 3. Test it
print("🤖 Connecting to Mistral Devstral 2 via OpenRouter...")
try:
    response = llm.invoke("Write a Python function to check if a number is prime.")
    print("\n✅ SUCCESS! Devstral replied:\n")
    print(response.content)
except Exception as e:
    print("\n❌ ERROR DETAILS:")
    print(e)