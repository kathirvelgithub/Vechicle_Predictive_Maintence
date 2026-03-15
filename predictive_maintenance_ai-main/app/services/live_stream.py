import asyncio
from datetime import datetime
from typing import Any, Dict


class LiveStreamManager:
    def __init__(self) -> None:
        self._connections: Dict[int, Any] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: Any) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[id(websocket)] = websocket
        await websocket.send_json(
            {
                "topic": "stream.connected",
                "payload": {
                    "message": "connected",
                    "connections": await self.connection_count(),
                },
                "timestamp": datetime.utcnow().isoformat(),
            }
        )

    async def disconnect(self, websocket: Any) -> None:
        async with self._lock:
            self._connections.pop(id(websocket), None)

    async def connection_count(self) -> int:
        async with self._lock:
            return len(self._connections)

    async def broadcast(self, topic: str, payload: Dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._connections.values())

        stale_ids = []
        message = {
            "topic": topic,
            "payload": payload,
            "timestamp": datetime.utcnow().isoformat(),
        }

        for websocket in targets:
            try:
                await websocket.send_json(message)
            except Exception:
                stale_ids.append(id(websocket))

        if stale_ids:
            async with self._lock:
                for stale_id in stale_ids:
                    self._connections.pop(stale_id, None)


stream_manager = LiveStreamManager()
