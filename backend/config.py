"""
Application-wide configuration settings.
All values are read from environment variables (loaded from .env via python-dotenv).
See .env.example for all available options.
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# When frozen by PyInstaller, sys.executable is the binary itself.
# Otherwise _ROOT is the project root (one level above backend/).
if getattr(sys, "frozen", False):
    _ROOT = Path(sys.executable).parent
else:
    _ROOT = Path(__file__).parent.parent

load_dotenv(_ROOT / ".env")

# ── Project Root & Data Directory ────────────────────────────────────────────
BASE_DIR = _ROOT
DATA_DIR = Path(os.getenv("DBAI_DATA_DIR", str(BASE_DIR / "data")))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# ── Database ──────────────────────────────────────────────────────────────────
SQLITE_URL = f"sqlite:///{DATA_DIR / 'dbai.sqlite'}"

# ── Server ────────────────────────────────────────────────────────────────────
API_HOST = os.getenv("DBAI_HOST", "127.0.0.1")
API_PORT = int(os.getenv("DBAI_PORT", "8000"))

# ── CORS ──────────────────────────────────────────────────────────────────────
CORS_ORIGINS = [
    "http://localhost:15173",  # Vite dev server
    "http://localhost:3000",
    "http://127.0.0.1:8000",  # Electron production (direct calls)
    "app://.",                 # Electron custom protocol (if used)
    "null",                    # file:// origin used by Electron loadFile()
]

# ── Query Execution ───────────────────────────────────────────────────────────
DEFAULT_QUERY_LIMIT = int(os.getenv("DBAI_DEFAULT_QUERY_LIMIT", "1000"))
QUERY_TIMEOUT_SEC   = int(os.getenv("DBAI_QUERY_TIMEOUT_SEC", "30"))

# ── Monitor ───────────────────────────────────────────────────────────────────
MONITOR_POLL_INTERVAL_SEC = int(os.getenv("DBAI_MONITOR_POLL_INTERVAL_SEC", "2"))

# ── AI Providers ─────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY       = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_DEFAULT_MODEL = os.getenv("ANTHROPIC_DEFAULT_MODEL", "claude-sonnet-4-6")

OPENAI_API_KEY          = os.getenv("OPENAI_API_KEY", "")
OPENAI_DEFAULT_MODEL    = os.getenv("OPENAI_DEFAULT_MODEL", "gpt-4o")

GEMINI_API_KEY          = os.getenv("GEMINI_API_KEY", "")
GEMINI_DEFAULT_MODEL    = os.getenv("GEMINI_DEFAULT_MODEL", "gemini-2.0-flash")

OPENROUTER_API_KEY      = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_DEFAULT_MODEL = os.getenv("OPENROUTER_DEFAULT_MODEL", "anthropic/claude-3.5-sonnet")
OPENROUTER_BASE_URL     = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

ACTIVE_AI_PROVIDER      = os.getenv("DBAI_ACTIVE_AI_PROVIDER", "anthropic")

# ── Default models by provider (used when no model is specified per-request) ──
PROVIDER_DEFAULTS: dict[str, dict] = {
    "anthropic": {
        "api_key":       ANTHROPIC_API_KEY,
        "default_model": ANTHROPIC_DEFAULT_MODEL,
        "base_url":      None,
    },
    "openai": {
        "api_key":       OPENAI_API_KEY,
        "default_model": OPENAI_DEFAULT_MODEL,
        "base_url":      None,
    },
    "gemini": {
        "api_key":       GEMINI_API_KEY,
        "default_model": GEMINI_DEFAULT_MODEL,
        "base_url":      None,
    },
    "openrouter": {
        "api_key":       OPENROUTER_API_KEY,
        "default_model": OPENROUTER_DEFAULT_MODEL,
        "base_url":      OPENROUTER_BASE_URL,
    },
}
