"""
Connection profile CRUD + connect/disconnect/test endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.storage.database import get_db
from backend.storage.repositories import ConnectionRepo
from backend.connectors.registry import ConnectorRegistry

router = APIRouter()


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class ConnectionIn(BaseModel):
    name: str
    db_type: str          # mssql | mysql | postgresql | sqlite
    host: str = ""
    port: int | None = None
    database: str         # file path for SQLite, DB name for others
    username: str = ""
    password: str = ""


class ConnectionOut(BaseModel):
    id: str
    name: str
    db_type: str
    host: str = ""
    port: int | None = None
    database: str
    username: str = ""
    is_connected: bool = False

    class Config:
        from_attributes = True


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[ConnectionOut])
def list_connections(db: Session = Depends(get_db)):
    """Return all saved connection profiles."""
    profiles = ConnectionRepo(db).get_all()
    result = []
    for p in profiles:
        out = ConnectionOut.model_validate(p)
        out.is_connected = ConnectorRegistry.is_connected(p.id)
        result.append(out)
    return result


@router.post("", response_model=ConnectionOut, status_code=201)
def create_connection(data: ConnectionIn, db: Session = Depends(get_db)):
    """Save a new connection profile."""
    _validate_db_type(data.db_type)
    profile = ConnectionRepo(db).create(data.model_dump())
    return ConnectionOut.model_validate(profile)


@router.get("/{id}", response_model=ConnectionOut)
def get_connection(id: str, db: Session = Depends(get_db)):
    profile = _get_or_404(id, db)
    out = ConnectionOut.model_validate(profile)
    out.is_connected = ConnectorRegistry.is_connected(id)
    return out


@router.put("/{id}", response_model=ConnectionOut)
def update_connection(id: str, data: ConnectionIn, db: Session = Depends(get_db)):
    _validate_db_type(data.db_type)
    repo = ConnectionRepo(db)
    profile = repo.update(id, data.model_dump())
    if not profile:
        raise HTTPException(404, "Connection not found")
    return ConnectionOut.model_validate(profile)


@router.delete("/{id}", status_code=204)
def delete_connection(id: str, db: Session = Depends(get_db)):
    ConnectorRegistry.disconnect(id)  # Close if active
    if not ConnectionRepo(db).delete(id):
        raise HTTPException(404, "Connection not found")


@router.post("/{id}/connect")
def connect(id: str, db: Session = Depends(get_db)):
    """Open a live DB connection and trigger schema introspection."""
    profile = _get_or_404(id, db)
    profile_dict = _profile_to_dict(profile)
    try:
        ConnectorRegistry.connect(id, profile_dict)
    except ConnectionError as e:
        raise HTTPException(400, str(e))

    # Kick off schema load in the background (non-blocking)
    _trigger_schema_load(id, profile_dict)

    return {"status": "connected", "connection_id": id}


@router.post("/{id}/disconnect")
def disconnect(id: str):
    """Close the live DB connection."""
    ConnectorRegistry.disconnect(id)
    return {"status": "disconnected", "connection_id": id}


@router.post("/{id}/test")
def test_connection(id: str, db: Session = Depends(get_db)):
    """Test connectivity without persisting a session."""
    profile = _get_or_404(id, db)
    profile_dict = _profile_to_dict(profile)
    try:
        ConnectorRegistry.connect(f"__test_{id}", profile_dict)
        ConnectorRegistry.disconnect(f"__test_{id}")
        return {"status": "ok"}
    except ConnectionError as e:
        raise HTTPException(400, str(e))


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_or_404(id: str, db: Session):
    profile = ConnectionRepo(db).get_by_id(id)
    if not profile:
        raise HTTPException(404, "Connection not found")
    return profile


def _validate_db_type(db_type: str) -> None:
    if db_type not in ("mssql", "mysql", "postgresql", "sqlite"):
        raise HTTPException(400, f"Invalid db_type '{db_type}'. Use mssql | mysql | postgresql | sqlite")


def _profile_to_dict(profile) -> dict:
    return {
        "db_type":  profile.db_type,
        "host":     profile.host,
        "port":     profile.port,
        "database": profile.database,
        "username": profile.username,
        "password": profile.password,
    }


def _trigger_schema_load(connection_id: str, profile: dict) -> None:
    """
    Start schema introspection after connect.
    Runs synchronously here; for large DBs consider moving to a background task.
    """
    import threading
    from backend.schema.introspector import SchemaIntrospector
    from backend.schema.cache import SchemaCache

    def _load():
        try:
            connector = ConnectorRegistry.get(connection_id)
            introspector = SchemaIntrospector(connector)
            schema = introspector.introspect()
            # Cache each database separately for granular refresh
            for db_entry in schema.get("databases", []):
                SchemaCache.set(connection_id, db_entry["name"], {"databases": [db_entry]})
        except Exception:
            pass  # Non-critical; user can refresh manually

    threading.Thread(target=_load, daemon=True).start()
