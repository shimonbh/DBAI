"""
PostgreSQL connector using psycopg2.
"""
import psycopg2
import psycopg2.extras
from typing import Any
from datetime import datetime

from backend.connectors.base import BaseConnector


class PostgreSQLConnector(BaseConnector):
    """Wraps psycopg2 for PostgreSQL connections."""

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def connect(self) -> None:
        p = self.profile
        try:
            self._connection = psycopg2.connect(
                host=p["host"],
                port=p.get("port") or 5432,
                dbname=p["database"],
                user=p["username"],
                password=p["password"],
                connect_timeout=10,
            )
            self._connection.autocommit = True
        except psycopg2.Error as e:
            raise ConnectionError(f"PostgreSQL connect failed: {e}") from e

    def disconnect(self) -> None:
        if self._connection and not self._connection.closed:
            self._connection.close()
        self._connection = None

    # ── Query Execution ───────────────────────────────────────────────────────

    def execute_query(self, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
        with self._connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute(sql, params or None)
            if cursor.description:
                return [dict(row) for row in cursor.fetchall()]
            return []

    # ── Schema Introspection ──────────────────────────────────────────────────

    def get_databases(self) -> list[str]:
        rows = self.execute_query(
            "SELECT datname FROM pg_database "
            "WHERE datistemplate = false AND datname != 'postgres' "
            "ORDER BY datname"
        )
        return [r["datname"] for r in rows]

    def get_tables(self, database: str) -> list[dict]:
        sql = """
            SELECT
                t.tablename AS name,
                'TABLE' AS type,
                s.n_live_tup AS row_count
            FROM pg_tables t
            LEFT JOIN pg_stat_user_tables s ON s.relname = t.tablename
            WHERE t.schemaname = 'public'
            ORDER BY t.tablename
        """
        return self.execute_query(sql)

    def get_columns(self, database: str, table: str) -> list[dict]:
        sql = """
            SELECT
                c.column_name AS name,
                c.data_type,
                (c.is_nullable = 'YES') AS nullable,
                c.column_default AS default,
                CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_pk
            FROM information_schema.columns c
            LEFT JOIN (
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                WHERE tc.constraint_type = 'PRIMARY KEY'
                  AND tc.table_name = %s
                  AND tc.table_schema = 'public'
            ) pk ON c.column_name = pk.column_name
            WHERE c.table_name = %s AND c.table_schema = 'public'
            ORDER BY c.ordinal_position
        """
        return self.execute_query(sql, (table, table))

    def get_views(self, database: str) -> list[dict]:
        sql = """
            SELECT viewname AS name
            FROM pg_views
            WHERE schemaname = 'public'
            ORDER BY viewname
        """
        return self.execute_query(sql)

    def get_procedures(self, database: str) -> list[dict]:
        sql = """
            SELECT
                routine_name AS name,
                routine_definition AS definition
            FROM information_schema.routines
            WHERE routine_schema = 'public'
              AND routine_type IN ('FUNCTION', 'PROCEDURE')
            ORDER BY routine_name
        """
        return self.execute_query(sql)

    def get_indexes(self, database: str, table: str) -> list[dict]:
        sql = """
            SELECT
                i.relname AS name,
                ix.indisunique AS is_unique,
                ix.indisprimary AS is_primary,
                array_to_string(
                    ARRAY(
                        SELECT a.attname
                        FROM pg_attribute a
                        WHERE a.attrelid = t.oid
                          AND a.attnum = ANY(ix.indkey)
                        ORDER BY a.attnum
                    ), ', '
                ) AS columns
            FROM pg_class t
            JOIN pg_index ix ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            WHERE t.relname = %s AND t.relkind = 'r'
            ORDER BY i.relname
        """
        return self.execute_query(sql, (table,))

    # ── Monitoring ────────────────────────────────────────────────────────────

    def get_metrics(self) -> dict:
        # Active connections (non-idle)
        conn_rows = self.execute_query(
            "SELECT COUNT(*) AS cnt FROM pg_stat_activity "
            "WHERE state != 'idle' AND pid != pg_backend_pid()"
        )
        active_connections = conn_rows[0]["cnt"] if conn_rows else 0

        # Transactions per second (approximate from pg_stat_database)
        tps_rows = self.execute_query(
            "SELECT SUM(xact_commit + xact_rollback) AS tps "
            "FROM pg_stat_database WHERE datname = current_database()"
        )
        queries_per_sec = int(tps_rows[0]["tps"] or 0) if tps_rows else 0

        # Slow queries (running > 1 second)
        slow_rows = self.execute_query(
            "SELECT query AS sql_text, "
            "EXTRACT(EPOCH FROM (now() - query_start)) * 1000 AS duration_ms "
            "FROM pg_stat_activity "
            "WHERE state = 'active' "
            "  AND query_start < now() - interval '1 second' "
            "  AND pid != pg_backend_pid() "
            "ORDER BY duration_ms DESC LIMIT 10"
        )
        slow_queries = [
            {
                "sql": r.get("sql_text", "") or "",
                "duration_ms": int(r.get("duration_ms") or 0),
                "timestamp": datetime.utcnow().isoformat(),
            }
            for r in slow_rows
        ]

        return {
            "cpu_percent": 0,
            "active_connections": active_connections,
            "queries_per_sec": queries_per_sec,
            "slow_queries": slow_queries,
        }
