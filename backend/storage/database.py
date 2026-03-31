"""
SQLAlchemy engine and session factory for the local SQLite database.
All other modules import `get_session` to obtain a DB session.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager
from backend.config import SQLITE_URL


# Single engine shared across the process
_engine = create_engine(
    SQLITE_URL,
    connect_args={"check_same_thread": False},  # Required for SQLite + async usage
    echo=False,
)

_SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False)


def init_db() -> None:
    """Create all tables if they don't exist. Called once at app startup."""
    from backend.storage.models import Base  # Import here to avoid circular dependency
    Base.metadata.create_all(bind=_engine)
    # Migrate existing databases: add columns introduced after initial release
    _run_migrations()


def _run_migrations() -> None:
    """Apply incremental schema changes to existing SQLite databases."""
    migrations = [
        "ALTER TABLE connection_profiles ADD COLUMN windows_auth BOOLEAN DEFAULT 0",
    ]
    with _engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(_text(sql))
                conn.commit()
            except Exception:
                pass  # Column already exists — safe to ignore


from sqlalchemy import text as _text


@contextmanager
def get_session() -> Session:
    """Context-manager session. Commits on success, rolls back on exception."""
    session = _SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db():
    """FastAPI dependency that yields a session per request."""
    with get_session() as session:
        yield session
