from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.live_stream import stream_manager

router = APIRouter()


@router.websocket("/ws")
async def stream_socket(websocket: WebSocket):
    await stream_manager.connect(websocket)
    try:
        while True:
            message = await websocket.receive_text()
            if message.strip().lower() == "ping":
                await websocket.send_json({"topic": "stream.pong", "payload": {"ok": True}})
    except WebSocketDisconnect:
        await stream_manager.disconnect(websocket)
    except Exception:
        await stream_manager.disconnect(websocket)
