"""
DB monitor endpoints: REST snapshot + WebSocket live stream.
"""
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException

from backend.connectors.registry import ConnectorRegistry
from backend.monitor.collector import MetricsCollector
from backend.monitor.broadcaster import broadcaster

router = APIRouter()

# Active collectors: connection_id → MetricsCollector
_collectors: dict[str, MetricsCollector] = {}


@router.get("/{connection_id}/snapshot")
def get_snapshot(connection_id: str):
    """Return a single metrics snapshot (one-shot REST call)."""
    try:
        connector = ConnectorRegistry.get(connection_id)
    except LookupError as e:
        raise HTTPException(404, str(e))

    from datetime import datetime
    metrics = connector.get_metrics()
    return {
        "timestamp":          datetime.utcnow().isoformat(),
        "connection_id":      connection_id,
        "cpu_percent":        metrics.get("cpu_percent", 0),
        "active_connections": metrics.get("active_connections", 0),
        "queries_per_sec":    metrics.get("queries_per_sec", 0),
        "slow_queries":       metrics.get("slow_queries", []),
    }


@router.get("/{connection_id}/slow-queries")
def get_slow_queries(connection_id: str):
    """Return the current slow query list for heat-map display."""
    try:
        connector = ConnectorRegistry.get(connection_id)
    except LookupError as e:
        raise HTTPException(404, str(e))

    metrics = connector.get_metrics()
    return {"slow_queries": metrics.get("slow_queries", [])}


@router.websocket("/ws/{connection_id}")
async def monitor_websocket(websocket: WebSocket, connection_id: str):
    """
    WebSocket endpoint for live metrics streaming.
    Starts a MetricsCollector for the connection if not already running.
    Broadcasts metrics every MONITOR_POLL_INTERVAL_SEC seconds.
    """
    await broadcaster.connect(connection_id, websocket)

    # Start a collector for this connection if one doesn't exist yet
    if connection_id not in _collectors:
        async def push(data: dict):
            await broadcaster.broadcast(connection_id, data)

        collector = MetricsCollector(connection_id, on_metrics=push)
        _collectors[connection_id] = collector
        collector.start()

    try:
        # Keep the connection alive; actual data is pushed by the collector
        while True:
            await websocket.receive_text()  # Waits for client ping or disconnect
    except WebSocketDisconnect:
        pass
    finally:
        broadcaster.disconnect(connection_id, websocket)
        # Stop collector when the last client disconnects
        if not broadcaster.has_clients(connection_id):
            collector = _collectors.pop(connection_id, None)
            if collector:
                collector.stop()
