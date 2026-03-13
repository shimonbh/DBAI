"""
ConnectorRegistry — manages active DB sessions across all API requests.
Acts as a process-level singleton: connection_id → BaseConnector instance.
"""
from threading import Lock
from backend.connectors.base import BaseConnector


class ConnectorRegistry:
    """
    Thread-safe registry of active database connections.
    All API handlers call ConnectorRegistry.get(id) to obtain the live connector.
    """

    _active: dict[str, BaseConnector] = {}
    _lock = Lock()

    # ── Import connectors lazily to avoid heavy driver imports at module load ──

    @staticmethod
    def _get_class(db_type: str):
        if db_type == "mssql":
            from backend.connectors.mssql import MSSQLConnector
            return MSSQLConnector
        if db_type == "mysql":
            from backend.connectors.mysql import MySQLConnector
            return MySQLConnector
        if db_type == "postgresql":
            from backend.connectors.postgresql import PostgreSQLConnector
            return PostgreSQLConnector
        if db_type == "sqlite":
            from backend.connectors.sqlite import SQLiteConnector
            return SQLiteConnector
        raise ValueError(f"Unknown db_type: '{db_type}'. Expected mssql | mysql | postgresql | sqlite")

    # ── Public API ────────────────────────────────────────────────────────────

    @classmethod
    def connect(cls, connection_id: str, profile: dict) -> None:
        """
        Open a new connection for connection_id.
        If one already exists it is closed first.
        """
        cls.disconnect(connection_id)  # Close existing if any
        ConnClass = cls._get_class(profile["db_type"])
        connector = ConnClass(profile)
        connector.connect()
        with cls._lock:
            cls._active[connection_id] = connector

    @classmethod
    def get(cls, connection_id: str) -> BaseConnector:
        """
        Return the active connector for a connection_id.
        Raises LookupError if no active connection exists.
        """
        with cls._lock:
            connector = cls._active.get(connection_id)
        if not connector:
            raise LookupError(
                f"No active connection for id '{connection_id}'. "
                "Connect first via POST /api/connections/{id}/connect"
            )
        return connector

    @classmethod
    def disconnect(cls, connection_id: str) -> None:
        """Close and remove the connection for connection_id. Safe if not connected."""
        with cls._lock:
            connector = cls._active.pop(connection_id, None)
        if connector:
            try:
                connector.disconnect()
            except Exception:
                pass  # Ignore errors on disconnect

    @classmethod
    def disconnect_all(cls) -> None:
        """Close all active connections. Called at app shutdown."""
        with cls._lock:
            ids = list(cls._active.keys())
        for cid in ids:
            cls.disconnect(cid)

    @classmethod
    def is_connected(cls, connection_id: str) -> bool:
        with cls._lock:
            return connection_id in cls._active

    @classmethod
    def active_ids(cls) -> list[str]:
        with cls._lock:
            return list(cls._active.keys())
