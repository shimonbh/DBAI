"""
MySQL connector using mysql-connector-python.
"""
import mysql.connector
from mysql.connector import Error as MySQLError
from typing import Any
from datetime import datetime

from backend.connectors.base import BaseConnector


class MySQLConnector(BaseConnector):
    """Wraps mysql.connector for MySQL/MariaDB connections."""

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def connect(self) -> None:
        p = self.profile
        try:
            self._connection = mysql.connector.connect(
                host=p["host"],
                port=p.get("port") or 3306,
                database=p["database"],
                user=p["username"],
                password=p["password"],
                connection_timeout=10,
                autocommit=True,
            )
        except MySQLError as e:
            raise ConnectionError(f"MySQL connect failed: {e}") from e

    def disconnect(self) -> None:
        if self._connection and self._connection.is_connected():
            self._connection.close()
        self._connection = None

    # ── Query Execution ───────────────────────────────────────────────────────

    def execute_query(self, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
        cursor = self._connection.cursor(dictionary=True)
        try:
            cursor.execute(sql, params)
            if cursor.description:
                return cursor.fetchall()
            return []
        finally:
            cursor.close()

    # ── Schema Introspection ──────────────────────────────────────────────────

    def get_databases(self) -> list[str]:
        rows = self.execute_query(
            "SELECT schema_name FROM information_schema.schemata "
            "WHERE schema_name NOT IN ('information_schema','mysql','performance_schema','sys') "
            "ORDER BY schema_name"
        )
        return [r["schema_name"] for r in rows]

    def get_tables(self, database: str) -> list[dict]:
        sql = """
            SELECT
                table_name AS name,
                'TABLE' AS type,
                table_rows AS row_count
            FROM information_schema.tables
            WHERE table_schema = %s AND table_type = 'BASE TABLE'
            ORDER BY table_name
        """
        return self.execute_query(sql, (database,))

    def get_views(self, database: str) -> list[dict]:
        sql = """
            SELECT table_name AS name
            FROM information_schema.views
            WHERE table_schema = %s
            ORDER BY table_name
        """
        return self.execute_query(sql, (database,))

    def get_procedures(self, database: str) -> list[dict]:
        sql = """
            SELECT
                routine_name AS name,
                routine_definition AS definition
            FROM information_schema.routines
            WHERE routine_schema = %s AND routine_type = 'PROCEDURE'
            ORDER BY routine_name
        """
        return self.execute_query(sql, (database,))

    def get_columns(self, database: str, table: str) -> list[dict]:
        sql = """
            SELECT
                column_name AS name,
                data_type,
                IS_NULLABLE = 'YES' AS nullable,
                column_default AS `default`,
                CASE WHEN column_key = 'PRI' THEN 1 ELSE 0 END AS is_pk
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            ORDER BY ordinal_position
        """
        rows = self.execute_query(sql, (database, table))
        # Normalize nullable to bool
        for row in rows:
            row["nullable"] = bool(row.get("nullable", 0))
        return rows

    def get_indexes(self, database: str, table: str) -> list[dict]:
        sql = """
            SELECT
                index_name AS name,
                GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns,
                non_unique = 0 AS is_unique,
                index_name = 'PRIMARY' AS is_primary
            FROM information_schema.statistics
            WHERE table_schema = %s AND table_name = %s
            GROUP BY index_name, non_unique
        """
        return self.execute_query(sql, (database, table))

    # ── Monitoring ────────────────────────────────────────────────────────────

    def get_metrics(self) -> dict:
        # Active connections
        conn_rows = self.execute_query(
            "SELECT COUNT(*) AS cnt FROM information_schema.processlist WHERE command != 'Sleep'"
        )
        active_connections = conn_rows[0]["cnt"] if conn_rows else 0

        # Queries per second from status
        qps = 0
        try:
            status_rows = self.execute_query(
                "SHOW GLOBAL STATUS LIKE 'Queries'"
            )
            qps = int(status_rows[0].get("Value", 0)) if status_rows else 0
        except Exception:
            pass

        # Slow queries currently running (> 1 second)
        slow_rows = self.execute_query(
            "SELECT info AS sql_text, time AS duration_sec "
            "FROM information_schema.processlist "
            "WHERE command != 'Sleep' AND time > 1 "
            "ORDER BY time DESC LIMIT 10"
        )
        slow_queries = [
            {
                "sql": r.get("sql_text", "") or "",
                "duration_ms": (r.get("duration_sec") or 0) * 1000,
                "timestamp": datetime.utcnow().isoformat(),
            }
            for r in slow_rows
        ]

        return {
            "cpu_percent": 0,
            "active_connections": active_connections,
            "queries_per_sec": qps,
            "slow_queries": slow_queries,
        }
