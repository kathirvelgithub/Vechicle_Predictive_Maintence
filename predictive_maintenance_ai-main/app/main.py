import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# ✅ FIX 1: Correct Imports matching your file structure (app/api/routes_*.py)
# You do not have a 'routers' folder, so we import directly from app.api
from app.api import routes_predictive, routes_telematics, routes_fleet, routes_test, routes_notifications, routes_scheduling, routes_stream
from app.services.escalation_queue import escalation_queue

app = FastAPI(title="Predictive Maintenance AI API")

# --- CORS SETUP ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Static Files: Serve audio recordings ---
AUDIO_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data_samples")
os.makedirs(AUDIO_DIR, exist_ok=True)
app.mount("/audio", StaticFiles(directory=AUDIO_DIR), name="audio")

# --- Register Routes ---
app.include_router(routes_predictive.router, prefix="/api/predictive", tags=["AI"])
app.include_router(routes_telematics.router, prefix="/api/telematics", tags=["Data"])
app.include_router(routes_fleet.router, prefix="/api/fleet", tags=["Fleet"])
app.include_router(routes_test.router, prefix="/api/test", tags=["Testing"])
app.include_router(routes_notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(routes_scheduling.router, prefix="/api/scheduling", tags=["Scheduling"])
app.include_router(routes_stream.router, prefix="/api/stream", tags=["Streaming"])


@app.on_event("startup")
async def startup_event():
    await escalation_queue.start(worker_count=1)


@app.on_event("shutdown")
async def shutdown_event():
    await escalation_queue.stop()

@app.get("/")
def health_check():
    return {"status": "AI System Online", "version": "1.0.0"}

if __name__ == "__main__":
    # ✅ FIX 2: Correct App Path for Uvicorn
    # This assumes you are running the command from the project ROOT folder
    print("🚀 Starting Server...")
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)