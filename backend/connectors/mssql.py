"""
Microsoft SQL Server connector using pyodbc.
Requires "ODBC Driver 17 for SQL Server" or "ODBC Driver 18 for SQL Server" installed.
"""
import pyodbc
from typing import Any
from datetime import datetime

from backend.connectors.base import BaseConnector
from backend.config import CONNECTION_TIMEOUT_SEC


def _best_odbc_driver() -> str:
    """Return the best available ODBC driver for SQL Server, or raise."""
    available = pyodbc.drivers()
    for preferred in ("ODBC Driver 18 for SQL Server", "ODBC Driver 17 for SQL Server"):
        if preferred in available:
            return preferred
    # Fall back to any driver that mentions SQL Server
    for d in available:
        if "SQL Server" in d:
            return d
    raise ConnectionError(
        "No ODBC Driver for SQL Server found on this machine. "
        "Install 'ODBC Driver 17 for SQL Server' or 'ODBC Driver 18 for SQL Server' "
        "from https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server"
    )


class MSSQLConnector(BaseConnector):
    """Wraps pyodbc for MSSQL connections."""

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def connect(self) -> None:
        p = self.profile
        port = p.get("port") or 1433
        driver = _best_odbc_driver()

        if p.get("windows_auth"):
            conn_str = (
                f"DRIVER={{{driver}}};"
                f"SERVER={p['host']},{port};"
                f"DATABASE={p['database']};"
                "Trusted_Connection=yes;"
                "Encrypt=no;"
            )
        else:
            conn_str = (
                f"DRIVER={{{driver}}};"
                f"SERVER={p['host']},{port};"
                f"DATABASE={p['database']};"
                f"UID={p['username']};"
                f"PWD={p['password']};"
                "Encrypt=no;"
            )
        try:
            self._connection = pyodbc.connect(conn_str, timeout=CONNECTION_TIMEOUT_SEC)
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

    def get_triggers(self, database: str, table: str) -> list[dict]:
        sql = f"""
            USE [{database}];
            SELECT
                t.name AS name,
                CASE WHEN t.is_instead_of_trigger = 1
                     THEN 'INSTEAD OF' ELSE 'AFTER' END AS timing,
                STRING_AGG(te.type_desc, ', ') AS event,
                m.definition AS body
            FROM sys.triggers t
            JOIN sys.trigger_events te ON t.object_id = te.object_id
            JOIN sys.tables tb ON t.parent_id = tb.object_id
            LEFT JOIN sys.sql_modules m ON t.object_id = m.object_id
            WHERE tb.name = ?
            GROUP BY t.name, t.is_instead_of_trigger, m.definition
            ORDER BY t.name
        """
        return self.execute_query(sql, (table,))

    def get_constraints(self, database: str, table: str) -> list[dict]:
        sql = f"""
            USE [{database}];
            SELECT
                cc.name       AS name,
                cc.definition AS definition
            FROM sys.check_constraints cc
            JOIN sys.tables t ON cc.parent_object_id = t.object_id
            WHERE t.name = ?
            ORDER BY cc.name
        """
        return self.execute_query(sql, (table,))

    def get_foreign_keys(self, database: str, table: str) -> list[dict]:
        sql = f"""
            USE [{database}];
            SELECT
                fk.name AS name,
                STRING_AGG(COL_NAME(fkc.parent_object_id, fkc.parent_column_id), ', ')
                    WITHIN GROUP (ORDER BY fkc.constraint_column_id) AS columns,
                OBJECT_NAME(fk.referenced_object_id)                 AS ref_table,
                STRING_AGG(COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id), ', ')
                    WITHIN GROUP (ORDER BY fkc.constraint_column_id) AS ref_columns
            FROM sys.foreign_keys fk
            JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
            JOIN sys.tables t ON fk.parent_object_id = t.object_id
            WHERE t.name = ?
            GROUP BY fk.name, fk.referenced_object_id
            ORDER BY fk.name
        """
        return self.execute_query(sql, (table,))

    def get_procedure_params(self, database: str, procedure: str) -> list[dict]:
        sql = f"""
            USE [{database}];
            SELECT
                SUBSTRING(pm.name, 2, LEN(pm.name)) AS name,
                tp.name AS data_type
            FROM sys.parameters pm
            JOIN sys.types tp ON pm.user_type_id = tp.user_type_id
            JOIN sys.procedures sp ON pm.object_id = sp.object_id
            WHERE sp.name = ? AND pm.parameter_id > 0
            ORDER BY pm.parameter_id
        """
        return self.execute_query(sql, (procedure,))

    def get_columns(self, database: str, table: str) -> list[dict]:
        sql = f"""
            USE [{database}];
            SELECT
                c.name,
                tp.name AS data_type,
                c.is_nullable AS nullable,
                dc.definition AS [default],
                CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_pk
            FROM sys.columns c
            JOIN sys.types tp ON c.user_type_id = tp.user_type_id
            JOIN sys.tables t ON c.object_id = t.object_id
            LEFT JOIN sys.default_constraints dc
                ON dc.parent_object_id = c.object_id
               AND dc.parent_column_id = c.column_id
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

    def get_security(self, database: str) -> dict:
        # Server-level logins
        login_rows = self.execute_query(f"""
            USE [{database}];
            SELECT
                name,
                type_desc AS type,
                is_disabled
            FROM sys.server_principals
            WHERE type IN ('S', 'U', 'G')
              AND name NOT LIKE '##%'
            ORDER BY name
        """)
        users = []
        for r in login_rows:
            attrs = []
            if r.get("is_disabled"): attrs.append("DISABLED")
            users.append({
                "name": r["name"],
                "type": r.get("type", "").replace("_", " ").title(),
                "attributes": attrs,
            })

        # Database roles and memberships
        role_rows = self.execute_query(f"""
            USE [{database}];
            SELECT
                r.name  AS role,
                m.name  AS member
            FROM sys.database_role_members rm
            JOIN sys.database_principals r ON r.principal_id = rm.role_principal_id
            JOIN sys.database_principals m ON m.principal_id = rm.member_principal_id
            ORDER BY r.name, m.name
        """)
        membership: dict[str, list[str]] = {}
        for row in role_rows:
            membership.setdefault(row["role"], []).append(row["member"])

        # All database roles
        db_roles = self.execute_query(f"""
            USE [{database}];
            SELECT name FROM sys.database_principals
            WHERE type = 'R' AND is_fixed_role = 0
            ORDER BY name
        """)
        roles = [{"name": r["name"], "members": membership.get(r["name"], []), "attributes": []} for r in db_roles]

        return {"users": users, "roles": roles}

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
