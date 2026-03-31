"""
MySQL connector using mysql-connector-python.
"""
import mysql.connector
from mysql.connector import Error as MySQLError
from typing import Any
from datetime import datetime, timedelta
from decimal import Decimal

from backend.connectors.base import BaseConnector
from backend.config import CONNECTION_TIMEOUT_SEC


def _native(value: Any) -> Any:
    """Convert MySQL-specific types to plain Python types for JSON serialisation."""
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, (bytes, bytearray)):
        # Single-byte: boolean comparison columns (e.g. non_unique = 0)
        if len(value) == 1:
            return bool(value[0])
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return value.hex()
    if isinstance(value, timedelta):
        total = int(value.total_seconds())
        return f"{total // 3600:02d}:{(total % 3600) // 60:02d}:{total % 60:02d}"
    return value


def _normalize(rows: list[dict]) -> list[dict]:
    """Lowercase all column names and convert MySQL-specific value types."""
    return [{k.lower(): _native(v) for k, v in row.items()} for row in rows]


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
                connection_timeout=CONNECTION_TIMEOUT_SEC,
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
        # Reconnect silently if the server dropped an idle connection
        try:
            self._connection.ping(reconnect=True, attempts=2, delay=1)
        except Exception:
            pass
        cursor = self._connection.cursor(dictionary=True)
        try:
            cursor.execute(sql, params)
            if cursor.description:
                return _normalize(cursor.fetchall())
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

    def get_procedure_params(self, database: str, procedure: str) -> list[dict]:
        sql = """
            SELECT
                parameter_name AS name,
                data_type
            FROM information_schema.parameters
            WHERE specific_schema = %s
              AND specific_name = %s
              AND parameter_mode IS NOT NULL
            ORDER BY ordinal_position
        """
        return self.execute_query(sql, (database, procedure))

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
        return self.execute_query(sql, (database, table))

    def get_triggers(self, database: str, table: str) -> list[dict]:
        sql = """
            SELECT
                trigger_name          AS name,
                action_timing         AS timing,
                event_manipulation    AS event,
                action_statement      AS body
            FROM information_schema.triggers
            WHERE trigger_schema = %s AND event_object_table = %s
            ORDER BY trigger_name, event_manipulation
        """
        return self.execute_query(sql, (database, table))

    def get_constraints(self, database: str, table: str) -> list[dict]:
        sql = """
            SELECT
                tc.constraint_name      AS name,
                cc.check_clause         AS definition
            FROM information_schema.table_constraints tc
            JOIN information_schema.check_constraints cc
                ON  cc.constraint_schema = tc.constraint_schema
                AND cc.constraint_name   = tc.constraint_name
            WHERE tc.table_schema    = %s
              AND tc.table_name      = %s
              AND tc.constraint_type = 'CHECK'
            ORDER BY tc.constraint_name
        """
        return self.execute_query(sql, (database, table))

    def get_foreign_keys(self, database: str, table: str) -> list[dict]:
        sql = """
            SELECT
                kcu.constraint_name                                              AS name,
                GROUP_CONCAT(kcu.column_name ORDER BY kcu.ordinal_position)     AS columns,
                kcu.referenced_table_name                                        AS ref_table,
                GROUP_CONCAT(kcu.referenced_column_name ORDER BY kcu.ordinal_position) AS ref_columns
            FROM information_schema.key_column_usage kcu
            JOIN information_schema.referential_constraints rc
                ON  rc.constraint_schema = kcu.table_schema
                AND rc.constraint_name   = kcu.constraint_name
            WHERE kcu.table_schema = %s AND kcu.table_name = %s
            GROUP BY kcu.constraint_name, kcu.referenced_table_name
            ORDER BY kcu.constraint_name
        """
        return self.execute_query(sql, (database, table))

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

    def get_security(self, database: str) -> dict:
        users = []
        try:
            rows = self.execute_query(
                "SELECT user AS name, host, account_locked FROM mysql.user ORDER BY user, host"
            )
            for r in rows:
                attrs = []
                locked = r.get("account_locked")
                if locked and str(locked).upper() in ("Y", "1", "TRUE"): attrs.append("LOCKED")
                users.append({
                    "name": f"{r['name']}@{r['host']}",
                    "type": "login",
                    "attributes": attrs,
                })
        except Exception:
            pass  # mysql.user may not be readable without SUPER privilege

        # Roles (MySQL 8+)
        roles = []
        try:
            role_rows = self.execute_query(
                "SELECT role_name AS name FROM information_schema.APPLICABLE_ROLES GROUP BY role_name ORDER BY role_name"
            )
            member_rows = self.execute_query(
                "SELECT FROM_USER AS member, TO_USER AS role FROM information_schema.ROLE_EDGES ORDER BY role, member"
            )
            membership: dict[str, list[str]] = {}
            for row in member_rows:
                membership.setdefault(row["role"], []).append(row["member"])
            for r in role_rows:
                roles.append({"name": r["name"], "members": membership.get(r["name"], []), "attributes": []})
        except Exception:
            pass  # Roles not available in MySQL < 8

        return {"users": users, "roles": roles}

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
