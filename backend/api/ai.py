"""
AI agent API endpoints.
All endpoints accept an optional {provider, model} override.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.connectors.registry import ConnectorRegistry
from backend.schema.cache import SchemaCache
from backend.schema.introspector import SchemaIntrospector
from backend.storage.database import get_db
from backend.storage.repositories import AIProviderRepo
from backend.agent.autocomplete import InlineAutocompleteAgent
from backend.agent.full_query import FullQueryAgent
from backend.agent.text_to_sql import TextToSQLAgent
from backend.agent.analyzer import QueryAnalyzerAgent
from backend.agent.registry import AIProviderRegistry

router = APIRouter()


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class AIRequestBase(BaseModel):
    database: str | None = None   # Focus schema context on this DB
    provider: str | None = None   # Override active provider
    model: str | None = None      # Override default model


class AutocompleteRequest(AIRequestBase):
    partial_sql: str


class CompleteRequest(AIRequestBase):
    context: str                  # Current editor content / partial query


class TextToSQLRequest(AIRequestBase):
    description: str


class AnalyzeRequest(AIRequestBase):
    sql: str


class NameQueryRequest(AIRequestBase):
    sql: str


class ProviderSettingIn(BaseModel):
    api_key: str | None = None
    default_model: str | None = None
    base_url: str | None = None
    is_active: bool | None = None


# ── Query AI Endpoints ────────────────────────────────────────────────────────

@router.post("/{connection_id}/autocomplete")
async def autocomplete(connection_id: str, req: AutocompleteRequest):
    """Fast inline suggestion for the next SQL tokens (streaming internally)."""
    db_type, schema_ctx = _get_context(connection_id, req.database)
    agent = InlineAutocompleteAgent(db_type, schema_ctx)
    suggestion = await agent.suggest(req.partial_sql, req.provider, req.model)
    return {"suggestion": suggestion}


@router.post("/{connection_id}/complete")
async def complete_query(connection_id: str, req: CompleteRequest):
    """Generate a full SQL query from partial editor content (Tab key trigger)."""
    db_type, schema_ctx = _get_context(connection_id, req.database)
    agent = FullQueryAgent(db_type, schema_ctx)
    sql = await agent.generate(req.context, req.provider, req.model)
    return {"sql": sql}


@router.post("/{connection_id}/text-to-sql")
async def text_to_sql(connection_id: str, req: TextToSQLRequest):
    """Convert natural language description to SQL."""
    db_type, schema_ctx = _get_context(connection_id, req.database)
    agent = TextToSQLAgent(db_type, schema_ctx)
    sql = await agent.convert(req.description, req.provider, req.model)
    return {"sql": sql}


@router.post("/{connection_id}/analyze")
async def analyze_query(connection_id: str, req: AnalyzeRequest):
    """Analyze SQL for issues and return structured improvement suggestions."""
    db_type, schema_ctx = _get_context(connection_id, req.database)
    agent = QueryAnalyzerAgent(db_type, schema_ctx)
    result = await agent.analyze(req.sql, req.provider, req.model)
    return result


@router.post("/{connection_id}/name-query")
async def name_query(connection_id: str, req: NameQueryRequest):
    """Generate a short name and one-sentence description for a SQL query (AI Save feature)."""
    from backend.agent.namer import QueryNamerAgent
    db_type, schema_ctx = _get_context(connection_id, req.database)
    agent = QueryNamerAgent(db_type, schema_ctx)
    result = await agent.name(req.sql, req.provider, req.model)
    return result


# ── Provider Settings ─────────────────────────────────────────────────────────

@router.get("/providers")
def list_providers(db: Session = Depends(get_db)):
    """List all configured AI providers (API keys redacted)."""
    providers = AIProviderRepo(db).get_all()
    result = []
    for p in providers:
        result.append({
            "provider_name": p.provider_name,
            "default_model": p.default_model,
            "base_url":      p.base_url,
            "is_active":     p.is_active,
            "has_api_key":   bool(p.api_key),  # Never expose the actual key
        })
    # Also list known providers with no settings yet
    configured = {r["provider_name"] for r in result}
    for name in AIProviderRegistry.list_providers():
        if name not in configured:
            result.append({
                "provider_name": name,
                "default_model": None,
                "base_url":      None,
                "is_active":     False,
                "has_api_key":   False,
            })
    return result


@router.put("/providers/{provider_name}")
def update_provider(
    provider_name: str,
    data: ProviderSettingIn,
    db: Session = Depends(get_db),
):
    """Save or update API key / model for a provider."""
    if provider_name not in AIProviderRegistry.list_providers():
        raise HTTPException(400, f"Unknown provider '{provider_name}'")

    repo = AIProviderRepo(db)
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    settings = repo.upsert(provider_name, update_data)

    # If is_active is being set to True, deactivate others
    if data.is_active:
        repo.set_active(provider_name)

    return {"status": "updated", "provider_name": settings.provider_name}


@router.get("/providers/models")
def list_models(provider: str | None = None):
    """Return known model IDs for all providers (or a specific one)."""
    providers = AIProviderRegistry.list_providers() if not provider else [provider]
    result = {}
    for name in providers:
        try:
            p, _ = AIProviderRegistry.get(name)
            result[name] = p.list_models()
        except Exception:
            result[name] = []
    return result


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_context(connection_id: str, database: str | None) -> tuple[str, str]:
    """Return (db_type, schema_context_string) for the connection."""
    try:
        connector = ConnectorRegistry.get(connection_id)
    except LookupError as e:
        raise HTTPException(404, str(e))

    db_type = connector.profile.get("db_type", "sql")

    # Build schema context from cache
    schema_data = SchemaCache.get_all_for_connection(connection_id)
    if not schema_data["databases"]:
        schema_context = "(Schema not yet loaded. Connect and wait for schema to load.)"
    else:
        introspector = SchemaIntrospector(connector)
        schema_context = introspector.build_schema_context(schema_data, database)

    return db_type, schema_context
