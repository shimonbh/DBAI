"""
Microsoft SQL Server connector using pyodbc.
Requires "ODBC Driver 17 for SQL Server" or "ODBC Driver 18 for SQL Server" installed.
"""
import pyodbc
from typing import Any
from datetime import datetime

from backend.connectors.base import BaseConnector


class MSSQLConnector(BaseConnector):
    """Wraps pyodbc for MSSQL connections."""

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def connect(self) -> None:
        p = self.profile
        port = p.get("port") or 1433
        conn_str = (
            f"DRIVER={{ODBC Driver 17 for SQL Server}};"
            f"SERVER={p['host']},{port};"
            f"DATABASE={p['database']};"
            f"UID={p['username']};"
            f"PWD={p['password']};"
            "Encrypt=no;"
        )
        try:
            self._connection = pyodbc.connect(conn_str, timeout=10)
        except pyodbc.Error as e:
            raise ConnectionError(f"MSSQL connect failed: {e}") from e

    def disconnect(self) -> None:
        if self._connection:
            self._connection.close()
            self._connection = None

    # ── Query Execution ───────────────────────────────────────────────────────

    def execute_query(self, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
        cursor = self._connection.cursor()
        try:
            cursor.execute(sql, params)
            if cursor.description:
                cols = [col[0] for col in cursor.description]
                return [dict(zip(cols, row)) for row in cursor.fetchall()]
            return []
        finally:
            cursor.close()

    # ── Schema Introspection ──────────────────────────────────────────────────

    def get_databases(self) -> list[str]:
        rows = self.execute_query(
            "SELECT name FROM sys.databases WHERE state_desc = 'ONLINE' ORDER BY name"
        )
        return [r["name"] for r in rows]

    def get_tables(self, database: str) -> list[dict]:
        sql = f"""
            USE [{database}];
            SELECT
                t.name,
                'TABLE' AS type,
                SUM(p.rows) AS row_count
            FROM sys.tables t
            JOIN sys.partitions p
                ON t.object_id = p.object_id AND p.index_id IN (0, 1)
            GROUP BY t.name
            ORDER BY t.name
        """
        return self.execute_query(sql)

    def get_views(self, database: str) -> list[dict]:
        sql = f"USE [{database}]; SELECT name FROM sys.views ORDER BY name"
        return self.execute_query(sql)

    def get_procedures(self, database: str) -> list[dict]:
        sql = f"""
            USE [{database}];
            SELECT
                p.name,
                m.definition
            FROM sys.procedures p
            LEFT JOIN sys.sql_modules m ON p.object_id = m.object_id
            ORDER BY p.name
        """
        return self.execute_query(sql)

    def get_columns(self, database: str, table: str) -> list[dict]:
        sql = f"""
            USE [{database}];
            SELECT
                c.name,
                tp.name AS data_type,
                c.is_nullable AS nullable,
                c.column_default AS [default],
                CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_pk
            FROM sys.columns c
            JOIN sys.types tp ON c.user_type_id = tp.user_type_id
            JOIN sys.tables t ON c.object_id = t.object_id
            LEFT JOIN (
                SELECT ic.object_id, ic.column_id
                FROM sys.index_columns ic
                JOIN sys.indexes i
                    ON ic.object_id = i.object_id AND ic.index_id = i.index_id
                WHERE i.is_primary_key = 1
            ) pk ON c.object_id = pk.object_id AND c.column_id = pk.column_id
            WHERE t.name = ?
            ORDER BY c.column_id
        """
        return self.execute_query(sql, (table,))

    def get_indexes(self, database: str, table: str) -> list[dict]:
        sql = f"""
            USE [{database}];
            SELECT
                i.name,
                i.is_unique,
                i.is_primary_key AS is_primary,
                STRING_AGG(c.name, ', ')
                    WITHIN GROUP (ORDER BY ic.key_ordinal) AS columns
            FROM sys.indexes i
            JOIN sys.index_columns ic
                ON i.object_id = ic.object_id AND i.index_id = ic.index_id
            JOIN sys.columns c
                ON ic.object_id = c.object_id AND ic.column_id = c.column_id
            JOIN sys.tables t ON i.object_id = t.object_id
            WHERE t.name = ?
            GROUP BY i.name, i.is_unique, i.is_primary_key
        """
        return self.execute_query(sql, (table,))

    # ── Monitoring ────────────────────────────────────────────────────────────

    def get_metrics(self) -> dict:
        # Active user connections
        conn_rows = self.execute_query(
            "SELECT COUNT(*) AS cnt FROM sys.dm_exec_sessions WHERE is_user_process = 1"
        )
        active_connections = conn_rows[0]["cnt"] if conn_rows else 0

        # Slow queries (running > 1 second)
        slow_sql = """
            SELECT TOP 10
                SUBSTRING(st.text, (r.statement_start_offset / 2) + 1,
                    ((CASE r.statement_end_offset
                        WHEN -1 THEN DATALENGTH(st.text)
                        ELSE r.statement_end_offset END
                    - r.statement_start_offset) / 2) + 1) AS sql_text,
                r.total_elapsed_time / 1000 AS duration_ms
            FROM sys.dm_exec_requests r
            CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
            WHERE r.total_elapsed_time > 1000
            ORDER BY r.total_elapsed_time DESC
        """
        try:
            slow_rows = self.execute_query(slow_sql)
        except Exception:
            slow_rows = []

        slow_queries = [
            {
                "sql": r.get("sql_text", ""),
                "duration_ms": r.get("duration_ms", 0),
                "timestamp": datetime.utcnow().isoformat(),
            }
            for r in slow_rows
        ]

        return {
            "cpu_percent": 0,               # Requires xp_cmdshell or OS-level access
            "active_connections": active_connections,
            "queries_per_sec": 0,
            "slow_queries": slow_queries,
        }
