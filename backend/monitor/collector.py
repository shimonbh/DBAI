"""
MetricsCollector — periodically polls DB metrics for a connection.
Runs in an asyncio task; results are pushed via the broadcaster.
"""
import asyncio
from datetime import datetime

from backend.connectors.registry import ConnectorRegistry
from backend.config import MONITOR_POLL_INTERVAL_SEC


class MetricsCollector:
    """
    Polls DB metrics at a fixed interval and calls the callback with each snapshot.
    One instance per monitored connection.
    """

    def __init__(self, connection_id: str, on_metrics):
        """
        Args:
            connection_id: The connection to monitor.
            on_metrics:    Async callable called with each metrics dict snapshot.
        """
        self.connection_id = connection_id
        self.on_metrics = on_metrics
        self._running = False
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        """Start the polling loop as an asyncio background task."""
        if not self._running:
            self._running = True
            self._task = asyncio.create_task(self._poll_loop())

    def stop(self) -> None:
        """Stop the polling loop."""
        self._running = False
        if self._task:
            self._task.cancel()

    async def _poll_loop(self) -> None:
        """Main polling loop — calls get_metrics() then waits for the interval."""
        while self._running:
            snapshot = self._collect()
            if snapshot:
                await self.on_metrics(snapshot)
            await asyncio.sleep(MONITOR_POLL_INTERVAL_SEC)

    def _collect(self) -> dict | None:
        """Collect one metrics snapshot. Returns None if connection is unavailable."""
        try:
            connector = ConnectorRegistry.get(self.connection_id)
            metrics = connector.get_metrics()
            return {
                "type":               "metrics",
                "timestamp":          datetime.utcnow().isoformat(),
                "connection_id":      self.connection_id,
                "cpu_percent":        metrics.get("cpu_percent", 0),
                "active_connections": metrics.get("active_connections", 0),
                "queries_per_sec":    metrics.get("queries_per_sec", 0),
                "slow_queries":       metrics.get("slow_queries", []),
            }
        except Exception:
            return None
