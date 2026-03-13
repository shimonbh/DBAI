"""
WebSocketBroadcaster — manages WebSocket clients and broadcasts metrics to them.
One global instance shared across all monitor WebSocket connections.
"""
import json
from fastapi import WebSocket


class WebSocketBroadcaster:
    """
    Maintains a set of active WebSocket connections per connection_id.
    Thread-safe broadcast via asyncio coroutines.
    """

    def __init__(self):
        # connection_id → set of WebSocket instances
        self._clients: dict[str, set[WebSocket]] = {}

    async def connect(self, connection_id: str, websocket: WebSocket) -> None:
        """Register a new WebSocket client for a connection."""
        await websocket.accept()
        if connection_id not in self._clients:
            self._clients[connection_id] = set()
        self._clients[connection_id].add(websocket)

    def disconnect(self, connection_id: str, websocket: WebSocket) -> None:
        """Remove a WebSocket client."""
        clients = self._clients.get(connection_id, set())
        clients.discard(websocket)
        if not clients:
            self._clients.pop(connection_id, None)

    async def broadcast(self, connection_id: str, data: dict) -> None:
        """Send a JSON message to all connected clients for a connection_id."""
        clients = list(self._clients.get(connection_id, set()))
        dead: list[WebSocket] = []

        for ws in clients:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                dead.append(ws)

        # Clean up closed connections
        for ws in dead:
            self.disconnect(connection_id, ws)

    def has_clients(self, connection_id: str) -> bool:
        return bool(self._clients.get(connection_id))

    def client_count(self, connection_id: str) -> int:
        return len(self._clients.get(connection_id, set()))


# Global singleton used by the monitor API router
broadcaster = WebSocketBroadcaster()
