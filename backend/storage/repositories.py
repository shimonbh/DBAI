"""
Repository classes for all database operations.
Each class wraps a SQLAlchemy session and provides focused, single-purpose methods.
Callers pass a session obtained from get_session() or get_db().
"""
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_

from backend.storage.models import (
    ConnectionProfile, QueryHistory, SavedQuery, SchemaCache, AIProviderSettings
)


# ── Connections ───────────────────────────────────────────────────────────────

class ConnectionRepo:
    def __init__(self, session: Session):
        self.db = session

    def get_all(self) -> list[ConnectionProfile]:
        return self.db.query(ConnectionProfile).order_by(ConnectionProfile.name).all()

    def get_by_id(self, id: str) -> ConnectionProfile | None:
        return self.db.get(ConnectionProfile, id)

    def create(self, data: dict) -> ConnectionProfile:
        profile = ConnectionProfile(**data)
        self.db.add(profile)
        self.db.flush()
        return profile

    def update(self, id: str, data: dict) -> ConnectionProfile | None:
        profile = self.get_by_id(id)
        if not profile:
            return None
        for key, value in data.items():
            setattr(profile, key, value)
        profile.updated_at = datetime.utcnow()
        self.db.flush()
        return profile

    def delete(self, id: str) -> bool:
        profile = self.get_by_id(id)
        if not profile:
            return False
        self.db.delete(profile)
        return True


# ── Query History ─────────────────────────────────────────────────────────────

class QueryRepo:
    def __init__(self, session: Session):
        self.db = session

    def record_execution(
        self,
        connection_id: str,
        sql_text: str,
        duration_ms: int | None,
        row_count: int | None,
        error_message: str | None = None,
    ) -> QueryHistory:
        """
        Save a query execution record.
        If the most recent entry for this connection has the same SQL (ignoring
        whitespace differences), update it in-place instead of adding a duplicate.
        """
        normalized = _normalize_sql(sql_text)

        last = (
            self.db.query(QueryHistory)
            .filter(QueryHistory.connection_id == connection_id)
            .order_by(desc(QueryHistory.executed_at))
            .first()
        )
        if last and _normalize_sql(last.sql_text) == normalized:
            # Same query — refresh stats instead of adding a duplicate row
            last.executed_at = datetime.utcnow()
            last.duration_ms = duration_ms
            last.row_count = row_count
            last.had_error = error_message is not None
            last.error_message = error_message
            self.db.flush()
            return last

        entry = QueryHistory(
            connection_id=connection_id,
            sql_text=sql_text,
            duration_ms=duration_ms,
            row_count=row_count,
            had_error=error_message is not None,
            error_message=error_message,
        )
        self.db.add(entry)
        self.db.flush()
        return entry

    def get_recent(self, connection_id: str, limit: int = 100) -> list[QueryHistory]:
        return (
            self.db.query(QueryHistory)
            .filter(QueryHistory.connection_id == connection_id)
            .order_by(desc(QueryHistory.executed_at))
            .limit(limit)
            .all()
        )

    def search(self, connection_id: str, text: str, limit: int = 50) -> list[QueryHistory]:
        """Full-text search over sql_text for a connection."""
        pattern = f"%{text}%"
        return (
            self.db.query(QueryHistory)
            .filter(
                QueryHistory.connection_id == connection_id,
                QueryHistory.sql_text.ilike(pattern),
            )
            .order_by(desc(QueryHistory.executed_at))
            .limit(limit)
            .all()
        )

    def delete_history(self, id: str) -> bool:
        entry = self.db.get(QueryHistory, id)
        if not entry:
            return False
        self.db.delete(entry)
        return True

    def save_query(self, data: dict) -> SavedQuery:
        query = SavedQuery(**data)
        self.db.add(query)
        self.db.flush()
        return query

    def get_saved(self, connection_id: str | None = None) -> list[SavedQuery]:
        q = self.db.query(SavedQuery)
        if connection_id:
            q = q.filter(
                or_(
                    SavedQuery.connection_id == connection_id,
                    SavedQuery.connection_id.is_(None),
                )
            )
        return q.order_by(SavedQuery.name).all()

    def get_saved_by_id(self, id: str) -> SavedQuery | None:
        return self.db.get(SavedQuery, id)

    def update_saved(self, id: str, data: dict) -> SavedQuery | None:
        query = self.get_saved_by_id(id)
        if not query:
            return None
        for key, value in data.items():
            setattr(query, key, value)
        query.updated_at = datetime.utcnow()
        self.db.flush()
        return query

    def delete_saved(self, id: str) -> bool:
        query = self.get_saved_by_id(id)
        if not query:
            return False
        self.db.delete(query)
        return True


# ── Schema Cache ──────────────────────────────────────────────────────────────

class SchemaCacheRepo:
    def __init__(self, session: Session):
        self.db = session

    def get(self, connection_id: str, database_name: str) -> SchemaCache | None:
        return (
            self.db.query(SchemaCache)
            .filter(
                SchemaCache.connection_id == connection_id,
                SchemaCache.database_name == database_name,
            )
            .first()
        )

    def upsert(self, connection_id: str, database_name: str, schema_data: dict) -> SchemaCache:
        """Insert or update schema cache for a connection+database."""
        entry = self.get(connection_id, database_name)
        if entry:
            entry.schema_data = schema_data
            entry.cached_at = datetime.utcnow()
        else:
            entry = SchemaCache(
                connection_id=connection_id,
                database_name=database_name,
                schema_data=schema_data,
            )
            self.db.add(entry)
        self.db.flush()
        return entry

    def invalidate(self, connection_id: str) -> None:
        """Remove all cached schemas for a connection (e.g., after reconnect)."""
        self.db.query(SchemaCache).filter(
            SchemaCache.connection_id == connection_id
        ).delete()


# ── AI Provider Settings ──────────────────────────────────────────────────────

class AIProviderRepo:
    def __init__(self, session: Session):
        self.db = session

    def get_all(self) -> list[AIProviderSettings]:
        return self.db.query(AIProviderSettings).order_by(AIProviderSettings.provider_name).all()

    def get_by_name(self, provider_name: str) -> AIProviderSettings | None:
        return (
            self.db.query(AIProviderSettings)
            .filter(AIProviderSettings.provider_name == provider_name)
            .first()
        )

    def get_active(self) -> AIProviderSettings | None:
        return (
            self.db.query(AIProviderSettings)
            .filter(AIProviderSettings.is_active == True)
            .first()
        )

    def upsert(self, provider_name: str, data: dict) -> AIProviderSettings:
        """Insert or update a provider's settings."""
        settings = self.get_by_name(provider_name)
        if settings:
            for key, value in data.items():
                setattr(settings, key, value)
            settings.updated_at = datetime.utcnow()
        else:
            settings = AIProviderSettings(provider_name=provider_name, **data)
            self.db.add(settings)
        self.db.flush()
        return settings

    def set_active(self, provider_name: str) -> None:
        """Make exactly one provider active; deactivate all others."""
        self.db.query(AIProviderSettings).update({"is_active": False})
        settings = self.get_by_name(provider_name)
        if settings:
            settings.is_active = True
        self.db.flush()


# ── Helpers ───────────────────────────────────────────────────────────────────

import re as _re

def _normalize_sql(sql: str) -> str:
    """Collapse all whitespace runs to a single space and lowercase for comparison."""
    return _re.sub(r'\s+', ' ', sql).strip().lower()
