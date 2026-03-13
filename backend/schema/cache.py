"""
SchemaCache — two-level cache: in-memory dict + SQLite persistence.
Memory cache avoids hitting SQLite on every autocomplete request.
"""
from datetime import datetime

from backend.storage.database import get_session
from backend.storage.repositories import SchemaCacheRepo


class SchemaCache:
    """
    Caches full schema trees keyed by (connection_id, database_name).
    The in-memory tier is process-local; SQLite survives restarts.
    """

    # In-memory: (connection_id, database_name) → {schema_data, cached_at}
    _memory: dict[tuple[str, str], dict] = {}

    # ── Public API ────────────────────────────────────────────────────────────

    @classmethod
    def get(cls, connection_id: str, database_name: str) -> dict | None:
        """Return cached schema or None if not cached."""
        # Try memory first
        key = (connection_id, database_name)
        if key in cls._memory:
            return cls._memory[key]["schema_data"]

        # Fall back to SQLite
        with get_session() as session:
            repo = SchemaCacheRepo(session)
            entry = repo.get(connection_id, database_name)
            if entry:
                cls._memory[key] = {
                    "schema_data": entry.schema_data,
                    "cached_at": entry.cached_at,
                }
                return entry.schema_data
        return None

    @classmethod
    def set(cls, connection_id: str, database_name: str, schema_data: dict) -> None:
        """Store schema in both memory and SQLite."""
        key = (connection_id, database_name)
        cls._memory[key] = {
            "schema_data": schema_data,
            "cached_at": datetime.utcnow(),
        }
        with get_session() as session:
            repo = SchemaCacheRepo(session)
            repo.upsert(connection_id, database_name, schema_data)

    @classmethod
    def invalidate(cls, connection_id: str) -> None:
        """Remove all cached entries for a connection (e.g., after reconnect)."""
        keys_to_remove = [k for k in cls._memory if k[0] == connection_id]
        for key in keys_to_remove:
            del cls._memory[key]
        with get_session() as session:
            repo = SchemaCacheRepo(session)
            repo.invalidate(connection_id)

    @classmethod
    def get_all_for_connection(cls, connection_id: str) -> dict:
        """
        Return the merged full schema tree for a connection across all cached databases.
        Returns {databases: [...]} combining all cached databases.
        """
        all_databases = []
        with get_session() as session:
            from backend.storage.models import SchemaCache as SchemaCacheModel
            entries = (
                session.query(SchemaCacheModel)
                .filter(SchemaCacheModel.connection_id == connection_id)
                .all()
            )
            for entry in entries:
                data = entry.schema_data
                all_databases.extend(data.get("databases", []))
        return {"databases": all_databases}
