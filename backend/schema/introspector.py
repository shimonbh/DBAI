"""
SchemaIntrospector — walks a connected database to build the full schema tree.
The result is a JSON-serializable dict that is cached in SQLite.
"""
from backend.connectors.base import BaseConnector


class SchemaIntrospector:
    """
    Uses a live BaseConnector to introspect databases, tables, columns, and indexes.
    Each method is focused and short; the full tree is assembled by introspect().
    """

    def __init__(self, connector: BaseConnector):
        self.connector = connector

    def introspect(self) -> dict:
        """
        Build and return the full schema tree for the connected server.
        Returns: {databases: [{name, tables: [{name, columns, indexes}]}]}
        """
        databases = self.connector.get_databases()
        return {
            "databases": [self._build_database(db) for db in databases]
        }

    def introspect_database(self, database: str) -> dict:
        """Introspect a single database (used for targeted refresh)."""
        return self._build_database(database)

    def _build_database(self, database: str) -> dict:
        tables = self.connector.get_tables(database)

        views_raw = []
        try:
            views_raw = self.connector.get_views(database)
        except Exception:
            pass

        procedures_raw = []
        try:
            procedures_raw = self.connector.get_procedures(database)
        except Exception:
            pass

        return {
            "name":       database,
            "tables":     [self._build_table(database, t["name"]) for t in tables],
            "views":      [self._build_view(database, v["name"]) for v in views_raw],
            "procedures": [
                {"name": p["name"], "definition": p.get("definition")}
                for p in procedures_raw
            ],
        }

    def _build_table(self, database: str, table: str) -> dict:
        return {
            "name":    table,
            "columns": self.connector.get_columns(database, table),
            "indexes": self.connector.get_indexes(database, table),
        }

    def _build_view(self, database: str, view: str) -> dict:
        columns = []
        try:
            columns = self.connector.get_columns(database, view)
        except Exception:
            pass
        return {
            "name":    view,
            "columns": columns,
        }

    def build_schema_context(self, schema: dict, database: str | None = None) -> str:
        """
        Produce a compact, token-efficient string representation of the schema
        for injection into AI agent prompts.

        Example output:
            Database: mydb
              Table: orders (id INT(PK), customer_id INT, status VARCHAR)
              Table: customers (id INT(PK), name VARCHAR, email VARCHAR)
        """
        lines: list[str] = []
        for db in schema.get("databases", []):
            if database and db["name"] != database:
                continue
            lines.append(f"Database: {db['name']}")
            for table in db.get("tables", []):
                col_parts = []
                for col in table.get("columns", []):
                    pk = "(PK)" if col.get("is_pk") else ""
                    col_parts.append(f"{col['name']} {col.get('data_type','')}{pk}")
                lines.append(f"  Table: {table['name']} ({', '.join(col_parts)})")
            for view in db.get("views", []):
                col_parts = [c["name"] for c in view.get("columns", [])]
                lines.append(f"  View: {view['name']} ({', '.join(col_parts)})")
            for proc in db.get("procedures", []):
                lines.append(f"  Procedure: {proc['name']}")
        return "\n".join(lines)
