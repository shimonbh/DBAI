"""
SQLite connector using Python's built-in sqlite3 module.
No driver installation needed.

The 'database' field in the profile is the file path to the .sqlite/.db file,
or ':memory:' for an in-memory database.
"""
import sqlite3
from typing import Any
from datetime import datetime

from backend.connectors.base import BaseConnector


class SQLiteConnector(BaseConnector):
    """Wraps sqlite3 for local SQLite file connections."""

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def connect(self) -> None:
        path = self.profile.get("database") or ""
        if not path:
            raise ConnectionError("SQLite requires a database file path")
        try:
            self._connection = sqlite3.connect(
                path,
                check_same_thread=False,  # Allow use from multiple threads
            )
            self._connection.row_factory = sqlite3.Row
        except sqlite3.Error as e:
            raise ConnectionError(f"SQLite connect failed: {e}") from e

    def disconnect(self) -> None:
        if self._connection:
            try:
                self._connection.close()
            except Exception:
                pass
        self._connection = None

    # ── Query Execution ───────────────────────────────────────────────────────

    def execute_query(self, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
        cursor = self._connection.cursor()
        try:
            cursor.execute(sql, params)
            if cursor.description:
                cols = [d[0] for d in cursor.description]
                return [
                    {col: self._safe_value(val) for col, val in zip(cols, row)}
                    for row in cursor.fetchall()
                ]
            self._connection.commit()
            return []
        except sqlite3.Error as e:
            self._connection.rollback()
            raise RuntimeError(f"SQLite query error: {e}") from e
        finally:
            cursor.close()

    @staticmethod
    def _safe_value(val: Any) -> Any:
        """Convert non-JSON-serializable SQLite values to safe representations."""
        if isinstance(val, bytes):
            return f"<binary {len(val)} bytes>"
        return val

    # ── Schema Introspection ──────────────────────────────────────────────────

    def get_databases(self) -> list[str]:
        """SQLite has a single database per file; return its logical name."""
        return ["main"]

    def get_tables(self, database: str) -> list[dict]:
        rows = self.execute_query(
            "SELECT name FROM sqlite_master "
            "WHERE type = 'table' AND name NOT LIKE 'sqlite_%' "
            "ORDER BY name"
        )
        result = []
        for r in rows:
            row_count = None
            try:
                cnt = self.execute_query(f'SELECT COUNT(*) AS cnt FROM "{r["name"]}"')
                row_count = cnt[0]["cnt"] if cnt else None
            except Exception:
                pass
            result.append({"name": r["name"], "type": "TABLE", "row_count": row_count})
        return result

    def get_views(self, database: str) -> list[dict]:
        rows = self.execute_query(
            "SELECT name FROM sqlite_master "
            "WHERE type = 'view' AND name NOT LIKE 'sqlite_%' "
            "ORDER BY name"
        )
        return [{"name": r["name"]} for r in rows]

    # SQLite has no stored procedures — get_procedures() returns [] (base default)

    def get_columns(self, database: str, table: str) -> list[dict]:
        rows = self.execute_query(f'PRAGMA table_info("{table}")')
        return [
            {
                "name":      r["name"],
                "data_type": r["type"] or "TEXT",
                "nullable":  not r["notnull"],
                "default":   r["dflt_value"],
                "is_pk":     bool(r["pk"]),
            }
            for r in rows
        ]

    def get_indexes(self, database: str, table: str) -> list[dict]:
        indexes = self.execute_query(f'PRAGMA index_list("{table}")')
        result = []
        for idx in indexes:
            cols = self.execute_query(f'PRAGMA index_info("{idx["name"]}")')
            result.append({
                "name":       idx["name"],
                "columns":    ", ".join(c["name"] for c in cols),
                "is_unique":  bool(idx["unique"]),
                "is_primary": idx["origin"] == "pk",
            })
        return result

    # ── Monitoring ────────────────────────────────────────────────────────────

    def get_metrics(self) -> dict:
        """SQLite is serverless — return static/empty metrics."""
        return {
            "cpu_percent":       0,
            "active_connections": 1,   # This process holds the file lock
            "queries_per_sec":   0,
            "slow_queries":      [],
        }
