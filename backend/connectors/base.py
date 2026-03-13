"""
Abstract base class for all database connectors.
Every DB-specific connector must implement all abstract methods defined here.
"""
from abc import ABC, abstractmethod
from typing import Any


class BaseConnector(ABC):
    """
    Provider-agnostic interface for database operations.
    Concrete subclasses wrap pyodbc, mysql-connector, or psycopg2.
    """

    def __init__(self, profile: dict):
        """
        Args:
            profile: connection profile dict with keys:
                     host, port, database, username, password, db_type
        """
        self.profile = profile
        self._connection = None

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    @abstractmethod
    def connect(self) -> None:
        """Open the DB connection. Raises ConnectionError on failure."""

    @abstractmethod
    def disconnect(self) -> None:
        """Close the connection cleanly. Safe to call if already closed."""

    def is_connected(self) -> bool:
        return self._connection is not None

    def reconnect(self) -> None:
        """Disconnect then reconnect."""
        self.disconnect()
        self.connect()

    # ── Query Execution ───────────────────────────────────────────────────────

    @abstractmethod
    def execute_query(self, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
        """
        Execute SQL and return rows as a list of dicts.
        Returns an empty list for non-SELECT statements (INSERT/UPDATE/DELETE).
        Raises on SQL error.
        """

    # ── Schema Introspection ──────────────────────────────────────────────────

    @abstractmethod
    def get_databases(self) -> list[str]:
        """Return names of all accessible databases/schemas."""

    @abstractmethod
    def get_tables(self, database: str) -> list[dict]:
        """
        Return table metadata for a database.
        Each dict: {name: str, type: str, row_count: int | None}
        """

    @abstractmethod
    def get_columns(self, database: str, table: str) -> list[dict]:
        """
        Return column metadata for a table.
        Each dict: {name, data_type, nullable, default, is_pk}
        """

    @abstractmethod
    def get_indexes(self, database: str, table: str) -> list[dict]:
        """
        Return index metadata for a table.
        Each dict: {name, columns, is_unique, is_primary}
        """

    def get_views(self, database: str) -> list[dict]:
        """
        Return view metadata for a database.
        Each dict: {name: str}
        Override in connectors that support views.
        """
        return []

    def get_procedures(self, database: str) -> list[dict]:
        """
        Return stored procedure metadata for a database.
        Each dict: {name: str, definition: str | None}
        Override in connectors that support stored procedures.
        """
        return []

    # ── Monitoring ────────────────────────────────────────────────────────────

    @abstractmethod
    def get_metrics(self) -> dict:
        """
        Return a snapshot of DB server health metrics.
        Dict keys: cpu_percent, active_connections, queries_per_sec, slow_queries
        slow_queries: list of {sql, duration_ms, timestamp}
        """
