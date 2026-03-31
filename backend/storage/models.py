"""
SQLAlchemy ORM models for all persisted data.
Each model maps to a SQLite table created by init_db().
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Text, DateTime, Boolean, JSON
)
from sqlalchemy.orm import DeclarativeBase


def _new_id() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


# ── Connection Profiles ───────────────────────────────────────────────────────

class ConnectionProfile(Base):
    """Saved database connection credentials."""
    __tablename__ = "connection_profiles"

    id         = Column(String, primary_key=True, default=_new_id)
    name       = Column(String(100), nullable=False)
    db_type    = Column(String(20), nullable=False)    # mssql | mysql | postgresql | sqlite
    host       = Column(String(255), nullable=True,  default="")  # not used for SQLite
    port       = Column(Integer,     nullable=True)
    database   = Column(String(500), nullable=False)              # file path for SQLite, DB name for others
    username     = Column(String(100), nullable=True,  default="")   # not used for SQLite
    password     = Column(String(255), nullable=True,  default="")   # not used for SQLite
    windows_auth = Column(Boolean,     nullable=True,  default=False) # MSSQL Windows Authentication
    created_at   = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Query History ─────────────────────────────────────────────────────────────

class QueryHistory(Base):
    """Record of every executed query, successful or not."""
    __tablename__ = "query_history"

    id            = Column(String, primary_key=True, default=_new_id)
    connection_id = Column(String, nullable=False, index=True)
    sql_text      = Column(Text, nullable=False)
    executed_at   = Column(DateTime, default=datetime.utcnow, index=True)
    duration_ms   = Column(Integer, nullable=True)
    row_count     = Column(Integer, nullable=True)
    had_error     = Column(Boolean, default=False)
    error_message = Column(Text, nullable=True)


# ── Saved Queries ─────────────────────────────────────────────────────────────

class SavedQuery(Base):
    """User-pinned / named queries that persist across sessions."""
    __tablename__ = "saved_queries"

    id            = Column(String, primary_key=True, default=_new_id)
    connection_id = Column(String, nullable=True)       # None = works with any connection
    name          = Column(String(200), nullable=False)
    description   = Column(Text, nullable=True)
    sql_text      = Column(Text, nullable=False)
    tags          = Column(JSON, default=list)
    created_at    = Column(DateTime, default=datetime.utcnow)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Schema Cache ──────────────────────────────────────────────────────────────

class SchemaCache(Base):
    """Cached schema tree for a connection+database. Refreshed on demand."""
    __tablename__ = "schema_cache"

    id            = Column(String, primary_key=True, default=_new_id)
    connection_id = Column(String, nullable=False, index=True)
    database_name = Column(String(100), nullable=False)
    schema_data   = Column(JSON, nullable=False)        # Full schema tree as JSON
    cached_at     = Column(DateTime, default=datetime.utcnow)


# ── AI Provider Settings ──────────────────────────────────────────────────────

class AIProviderSettings(Base):
    """API keys and default models for each AI provider."""
    __tablename__ = "ai_provider_settings"

    id            = Column(String, primary_key=True, default=_new_id)
    provider_name = Column(String(50), nullable=False, unique=True)  # anthropic | openai | gemini | openrouter
    api_key       = Column(String(500), nullable=True)
    default_model = Column(String(100), nullable=True)
    base_url      = Column(String(500), nullable=True)               # Used by OpenRouter
    is_active     = Column(Boolean, default=False)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
