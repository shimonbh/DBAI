"""
Query execution, history, saved queries, and file import endpoints.
"""
import time
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.storage.database import get_db
from backend.storage.repositories import QueryRepo
from backend.connectors.registry import ConnectorRegistry
from backend.config import DEFAULT_QUERY_LIMIT

router = APIRouter()


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class ExecuteRequest(BaseModel):
    sql: str
    database: str | None = None
    limit: int = DEFAULT_QUERY_LIMIT
    track_history: bool = True


class ExecuteResponse(BaseModel):
    query_id: str
    columns: list[str]
    rows: list[list[Any]]
    row_count: int
    duration_ms: int
    error: str | None = None


class SaveQueryIn(BaseModel):
    connection_id: str | None = None
    name: str
    description: str | None = None
    sql_text: str
    tags: list[str] = []


class SaveQueryOut(BaseModel):
    id: str
    connection_id: str | None
    name: str
    description: str | None
    sql_text: str
    tags: list[str]

    class Config:
        from_attributes = True


# ── Execute & History ─────────────────────────────────────────────────────────

@router.post("/{connection_id}/execute", response_model=ExecuteResponse)
def execute_query(
    connection_id: str,
    req: ExecuteRequest,
    db: Session = Depends(get_db),
):
    """Execute SQL against the active connection. Records result in history."""
    connector = _get_connector(connection_id)
    repo = QueryRepo(db)
    start_ms = _now_ms()

    # Optionally switch database before execution (dialect-specific USE statement)
    sql = _with_database_prefix(req.sql, req.database, connector)

    try:
        rows_dict = connector.execute_query(sql)
        duration = _now_ms() - start_ms

        # Limit rows to avoid huge payloads
        rows_dict = rows_dict[:req.limit]
        columns = list(rows_dict[0].keys()) if rows_dict else []
        rows = [list(r.values()) for r in rows_dict]

        entry_id = ""
        if req.track_history:
            entry = repo.record_execution(connection_id, req.sql, duration, len(rows))
            entry_id = entry.id
        return ExecuteResponse(
            query_id=entry_id,
            columns=columns,
            rows=rows,
            row_count=len(rows),
            duration_ms=duration,
        )
    except Exception as e:
        duration = _now_ms() - start_ms
        entry_id = ""
        if req.track_history:
            entry = repo.record_execution(
                connection_id, req.sql, duration, 0, error_message=str(e)
            )
            entry_id = entry.id
        return ExecuteResponse(
            query_id=entry_id,
            columns=[],
            rows=[],
            row_count=0,
            duration_ms=duration,
            error=str(e),
        )


@router.get("/{connection_id}/history")
def get_history(
    connection_id: str,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """Return recent query history for a connection."""
    return QueryRepo(db).get_recent(connection_id, limit=limit)


@router.delete("/{connection_id}/history/{history_id}", status_code=204)
def delete_history_entry(
    connection_id: str,
    history_id: str,
    db: Session = Depends(get_db),
):
    """Delete a single history entry."""
    if not QueryRepo(db).delete_history(history_id):
        raise HTTPException(404, "History entry not found")


@router.get("/{connection_id}/history/search")
def search_history(
    connection_id: str,
    q: str,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """Full-text search over query history."""
    return QueryRepo(db).search(connection_id, q, limit=limit)


# ── Saved Queries ─────────────────────────────────────────────────────────────

@router.get("/saved")
def list_saved(
    connection_id: str | None = None,
    db: Session = Depends(get_db),
):
    return QueryRepo(db).get_saved(connection_id)


@router.post("/saved", response_model=SaveQueryOut, status_code=201)
def save_query(data: SaveQueryIn, db: Session = Depends(get_db)):
    return QueryRepo(db).save_query(data.model_dump())


@router.put("/saved/{id}", response_model=SaveQueryOut)
def update_saved(id: str, data: SaveQueryIn, db: Session = Depends(get_db)):
    updated = QueryRepo(db).update_saved(id, data.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(404, "Saved query not found")
    return updated


@router.delete("/saved/{id}", status_code=204)
def delete_saved(id: str, db: Session = Depends(get_db)):
    if not QueryRepo(db).delete_saved(id):
        raise HTTPException(404, "Saved query not found")


# ── File Import ───────────────────────────────────────────────────────────────

@router.post("/import")
async def import_queries(file: UploadFile = File(...)):
    """
    Parse an uploaded .sql file and return individual SQL statements.
    Splits on semicolons and T-SQL GO statements.
    """
    content = await file.read()
    text = content.decode("utf-8", errors="replace")
    statements = _split_sql(text)
    return {"statements": statements, "count": len(statements)}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_connector(connection_id: str):
    try:
        return ConnectorRegistry.get(connection_id)
    except LookupError as e:
        raise HTTPException(404, str(e))


def _now_ms() -> int:
    return int(time.time() * 1000)


def _with_database_prefix(sql: str, database: str | None, connector) -> str:
    """Prepend a USE statement for MSSQL / MySQL if a target database is given."""
    if not database:
        return sql
    db_type = connector.profile.get("db_type", "")
    if db_type in ("mssql", "mysql"):
        return f"USE `{database}`;\n{sql}" if db_type == "mysql" else f"USE [{database}];\n{sql}"
    return sql  # PostgreSQL uses search_path or fully-qualified names


def _split_sql(text: str) -> list[str]:
    """
    Split a SQL file into individual statements.
    Handles semicolon-delimited statements and T-SQL GO batch separators.
    """
    import re
    # Split on GO (T-SQL) then on semicolons
    parts = re.split(r"^\s*GO\s*$", text, flags=re.IGNORECASE | re.MULTILINE)
    statements: list[str] = []
    for part in parts:
        for stmt in part.split(";"):
            cleaned = stmt.strip()
            if cleaned:
                statements.append(cleaned)
    return statements
