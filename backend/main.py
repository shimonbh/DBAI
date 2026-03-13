"""
FastAPI application entry point.
Registers all routers, configures CORS, and initializes SQLite on startup.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import API_HOST, API_PORT, CORS_ORIGINS
from backend.storage.database import init_db
from backend.api import connections, schema, queries, ai, monitor


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create DB tables and seed default AI provider settings."""
    init_db()
    _seed_ai_providers()
    yield
    # Shutdown: close any open DB connections
    from backend.connectors.registry import ConnectorRegistry
    ConnectorRegistry.disconnect_all()


def _seed_ai_providers() -> None:
    """Ensure default rows exist in ai_provider_settings from .env values."""
    from backend.storage.database import get_session
    from backend.storage.repositories import AIProviderRepo
    from backend.config import PROVIDER_DEFAULTS, ACTIVE_AI_PROVIDER

    with get_session() as session:
        repo = AIProviderRepo(session)
        for provider_name, cfg in PROVIDER_DEFAULTS.items():
            existing = repo.get_by_name(provider_name)
            if not existing:
                # Only seed if no record exists; don't overwrite user changes
                repo.upsert(provider_name, {
                    "api_key":       cfg["api_key"],
                    "default_model": cfg["default_model"],
                    "base_url":      cfg["base_url"],
                    "is_active":     provider_name == ACTIVE_AI_PROVIDER,
                })


app = FastAPI(
    title="D.B.A.I Backend",
    description="Database IDE backend with multi-DB support and AI agent layer",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Route Registration ────────────────────────────────────────────────────────
app.include_router(connections.router, prefix="/api/connections", tags=["connections"])
app.include_router(schema.router,      prefix="/api/schema",      tags=["schema"])
app.include_router(queries.router,     prefix="/api/queries",     tags=["queries"])
app.include_router(ai.router,          prefix="/api/ai",          tags=["ai"])
app.include_router(monitor.router,     prefix="/api/monitor",     tags=["monitor"])


@app.get("/health")
def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=API_HOST, port=API_PORT, reload=True)
