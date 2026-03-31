"""
Schema introspection endpoints.
Returns the schema tree for a connected database; supports forced refresh.
"""
from fastapi import APIRouter, HTTPException

from backend.connectors.registry import ConnectorRegistry
from backend.schema.introspector import SchemaIntrospector
from backend.schema.cache import SchemaCache

router = APIRouter()


@router.get("/{connection_id}")
def get_schema(connection_id: str):
    """
    Return the full schema tree for a connection.
    Serves from cache if available; use /refresh to force reload.
    """
    cached = SchemaCache.get_all_for_connection(connection_id)
    if cached["databases"]:
        return cached

    # No cache — introspect now (requires active connection)
    return _introspect_and_cache(connection_id)


@router.post("/{connection_id}/refresh")
def refresh_schema(connection_id: str):
    """Force re-introspect the DB and update the cache."""
    SchemaCache.invalidate(connection_id)
    return _introspect_and_cache(connection_id)


@router.get("/{connection_id}/{database}/tables")
def get_tables(connection_id: str, database: str):
    """Return the table list for a specific database."""
    connector = _get_connector(connection_id)
    return connector.get_tables(database)


@router.get("/{connection_id}/{database}/{table}/columns")
def get_columns(connection_id: str, database: str, table: str):
    """Return column metadata for a specific table."""
    connector = _get_connector(connection_id)
    return connector.get_columns(database, table)


@router.get("/{connection_id}/{database}/security")
def get_security(connection_id: str, database: str):
    """Return users, roles and memberships for a database."""
    connector = _get_connector(connection_id)
    try:
        return connector.get_security(database)
    except Exception as e:
        raise HTTPException(500, f"Security introspection failed: {e}") from e


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_connector(connection_id: str):
    try:
        return ConnectorRegistry.get(connection_id)
    except LookupError as e:
        raise HTTPException(404, str(e))


def _introspect_and_cache(connection_id: str) -> dict:
    connector = _get_connector(connection_id)
    introspector = SchemaIntrospector(connector)
    try:
        schema = introspector.introspect()
    except Exception as e:
        raise HTTPException(500, f"Schema introspection failed: {e}") from e
    for db_entry in schema.get("databases", []):
        SchemaCache.set(connection_id, db_entry["name"], {"databases": [db_entry]})
    return schema
