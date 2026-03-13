# DBAI — Database IDE with AI Agent

A full-featured database IDE with an embedded AI agent layer supporting multiple LLM providers.
Built with a Python FastAPI backend and a React + Electron frontend.

---

## Features

| Feature | Description |
|---------|-------------|
| **Multi-DB** | Connect to PostgreSQL, MySQL, and SQL Server |
| **Schema Explorer** | Auto-loads all databases, tables, columns, and indexes on connect |
| **AI Autocomplete** | Inline ghost-text suggestions as you type (debounced, streaming) |
| **Tab → Full Query** | Press Tab to have AI complete the entire query from context |
| **Text-to-SQL** | Describe what you want in plain English; AI writes the SQL |
| **Query Analysis** | Analyzes SQL for issues and returns an improved version |
| **Multi-provider AI** | Choose between Claude, OpenAI, Gemini, or OpenRouter |
| **Query History** | Every executed query is saved and full-text searchable |
| **Saved Queries** | Pin queries by name with tags and descriptions |
| **File Import** | Drag-and-drop or open `.sql` files; each statement opens in its own tab |
| **DB Monitor** | Live WebSocket stream of connections, QPS, and a slow-query heat map |
| **Dark Theme** | Fully configurable via `.env` — colors, font size, panel widths |

---

## Architecture

```
D:/Projects/DBAI/
├── .env                        ← All configuration (AI keys, colors, layout)
├── .env.example                ← Template — copy to .env
├── setup.bat                   ← One-time dependency installer
├── start.bat                   ← Launch backend + frontend
│
├── backend/                    ← Python FastAPI
│   ├── main.py                 ← App entry, router registration, startup
│   ├── config.py               ← Reads .env via python-dotenv
│   │
│   ├── api/                    ← HTTP + WebSocket route handlers
│   │   ├── connections.py      ← CRUD + connect/disconnect/test
│   │   ├── schema.py           ← Schema tree (cached)
│   │   ├── queries.py          ← Execute, history, saved, file import
│   │   ├── ai.py               ← Autocomplete, complete, text-to-sql, analyze
│   │   └── monitor.py          ← REST snapshot + WS /ws/monitor/{id}
│   │
│   ├── connectors/             ← Database driver wrappers
│   │   ├── base.py             ← BaseConnector (ABC)
│   │   ├── mssql.py            ← pyodbc (SQL Server)
│   │   ├── mysql.py            ← mysql-connector-python
│   │   ├── postgresql.py       ← psycopg2
│   │   └── registry.py        ← Active session map (connection_id → connector)
│   │
│   ├── agent/                  ← LLM agent layer
│   │   ├── base.py             ← BaseAIProvider (ABC)
│   │   ├── prompts.py          ← All prompt templates (centralized)
│   │   ├── registry.py         ← Resolves active provider from DB / .env
│   │   ├── autocomplete.py     ← InlineAutocompleteAgent (streaming)
│   │   ├── full_query.py       ← FullQueryAgent (Tab key)
│   │   ├── text_to_sql.py      ← TextToSQLAgent
│   │   ├── analyzer.py         ← QueryAnalyzerAgent
│   │   └── providers/
│   │       ├── anthropic.py    ← Claude (claude-sonnet-4-6)
│   │       ├── openai.py       ← GPT-4o, GPT-4o-mini
│   │       ├── gemini.py       ← Gemini 2.0 Flash / Pro
│   │       └── openrouter.py   ← Any model via openrouter.ai
│   │
│   ├── storage/                ← SQLite persistence (SQLAlchemy)
│   │   ├── database.py         ← Engine + session factory
│   │   ├── models.py           ← ORM models (5 tables)
│   │   └── repositories.py     ← ConnectionRepo, QueryRepo, SchemaCacheRepo, AIProviderRepo
│   │
│   ├── schema/
│   │   ├── introspector.py     ← Walks DB → tables → columns → indexes
│   │   └── cache.py            ← Two-level cache: memory + SQLite
│   │
│   └── monitor/
│       ├── collector.py        ← Polls DB metrics every N seconds (asyncio task)
│       └── broadcaster.py      ← Pushes metrics to all WebSocket clients
│
├── frontend/                   ← React + TypeScript + Vite + Electron
│   ├── electron/
│   │   ├── main.ts             ← BrowserWindow, file dialog IPC
│   │   └── preload.ts          ← Context bridge (safe API for renderer)
│   └── src/
│       ├── theme.ts            ← All colors/layout from .env constants
│       ├── components/
│       │   ├── layout/         ← AppShell, LeftPanel, Resizer
│       │   ├── connection/     ← ConnectionList, ConnectionForm, ConnectionBadge
│       │   ├── explorer/       ← DBExplorer, TableNode (schema tree)
│       │   ├── query-explorer/ ← QueryExplorer (history + saved + search)
│       │   ├── editor/         ← MonacoEditor, AIToolbar, SuggestionPanel, ResultsPane, EditorPanel
│       │   └── monitor/        ← MonitorPanel, MetricsGauges, SlowQueryHeatmap
│       ├── store/              ← Zustand: connection, schema, editor, query, monitor
│       ├── services/           ← Axios API clients + WebSocket monitor service
│       ├── hooks/              ← useAIAutocomplete (debounced), useMonitor (WS)
│       └── types/              ← TypeScript interfaces for all data shapes
│
└── data/
    └── dbai.sqlite             ← Auto-created: connections, history, schema cache, AI settings
```

### Data Flow

**Connect → Schema Load**
```
User clicks Connect →
  POST /api/connections/{id}/connect →
    ConnectorRegistry.connect() → DB driver opens connection →
  Background thread: SchemaIntrospector.introspect() →
    get_databases() → get_tables() → get_columns() → get_indexes() →
  SchemaCache.set() (memory + SQLite) →
  Frontend: DBExplorer renders tree
```

**AI Inline Suggestion (while typing)**
```
User types in Monaco →
  onChange → useAIAutocomplete (debounce 400ms) →
    POST /api/ai/{id}/autocomplete { partial_sql } →
      InlineAutocompleteAgent.suggest() →
        AIProviderRegistry.get() → streaming LLM call →
      Streamed tokens → first 80 chars returned →
  Monaco ghost text decoration shown (italic, muted color)
```

**Tab → Full Query**
```
User presses Tab (no selection) →
  Monaco command handler →
    POST /api/ai/{id}/complete { context: currentSQL } →
      FullQueryAgent.generate() → LLM (500 tokens) →
  editor.setValue(completedSQL)
```

**Query Execute**
```
User presses Ctrl+Enter →
  POST /api/queries/{id}/execute { sql, database } →
    ConnectorRegistry.get(id).execute_query(sql) →
    QueryRepo.record_execution() → saved to SQLite →
  ResultsPane renders columns + rows grid
```

**Monitor WebSocket**
```
MonitorPanel mounts → useMonitor hook →
  WebSocket /ws/monitor/{id} →
    Server: MetricsCollector polls DB every 2s →
    WebSocketBroadcaster.broadcast() →
  Client: appendSnapshot() → MetricsGauges + SlowQueryHeatmap update
```

---

## SQLite Tables

| Table | Purpose |
|-------|---------|
| `connection_profiles` | Saved DB connection credentials |
| `query_history` | Every executed query (sql, duration, row count, errors) |
| `saved_queries` | User-pinned named queries with tags |
| `schema_cache` | Cached schema JSON per connection+database |
| `ai_provider_settings` | API keys and active provider selection |

---

## API Reference

### Connections
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/connections` | List all profiles |
| POST | `/api/connections` | Create profile |
| PUT | `/api/connections/{id}` | Update profile |
| DELETE | `/api/connections/{id}` | Delete profile |
| POST | `/api/connections/{id}/connect` | Open live connection |
| POST | `/api/connections/{id}/disconnect` | Close connection |
| POST | `/api/connections/{id}/test` | Test without persisting |

### Schema
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/schema/{id}` | Full schema tree (cached) |
| POST | `/api/schema/{id}/refresh` | Force re-introspect |

### Queries
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/queries/{id}/execute` | Execute SQL |
| GET | `/api/queries/{id}/history` | Recent history |
| GET | `/api/queries/{id}/history/search?q=` | Full-text search |
| GET | `/api/queries/saved` | List saved queries |
| POST | `/api/queries/saved` | Save a query |
| POST | `/api/queries/import` | Import `.sql` file |

### AI
| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/api/ai/{id}/autocomplete` | `{partial_sql, provider?, model?}` | Inline suggestion |
| POST | `/api/ai/{id}/complete` | `{context, provider?, model?}` | Full query (Tab) |
| POST | `/api/ai/{id}/text-to-sql` | `{description, provider?, model?}` | NL → SQL |
| POST | `/api/ai/{id}/analyze` | `{sql, provider?, model?}` | Issues + improved SQL |
| GET | `/api/ai/providers` | — | List provider configs |
| PUT | `/api/ai/providers/{name}` | `{api_key, default_model, is_active}` | Update provider |

### Monitor
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/monitor/{id}/snapshot` | One-shot metrics |
| GET | `/api/monitor/{id}/slow-queries` | Current slow queries |
| WS | `/ws/monitor/{id}` | Live metrics stream (JSON every 2s) |

---

## Configuration (.env)

All configuration lives in `.env` at the project root. Copy `.env.example` to `.env` and edit.

### AI Providers
```env
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_DEFAULT_MODEL=claude-sonnet-4-6

OPENAI_API_KEY=sk-...
OPENAI_DEFAULT_MODEL=gpt-4o

GEMINI_API_KEY=AIza...
GEMINI_DEFAULT_MODEL=gemini-2.0-flash

OPENROUTER_API_KEY=sk-or-...
OPENROUTER_DEFAULT_MODEL=anthropic/claude-3.5-sonnet

# Which provider to use by default
DBAI_ACTIVE_AI_PROVIDER=anthropic
```

### Theme & Layout
```env
VITE_COLOR_SCHEME=dark
VITE_ACCENT_COLOR=#4f9cf9
VITE_EDITOR_THEME=vs-dark         # vs-dark | vs | hc-black | hc-light
VITE_BG_PRIMARY=#1e1e2e
VITE_BG_SECONDARY=#181825
VITE_BG_PANEL=#313244
VITE_TEXT_PRIMARY=#cdd6f4
VITE_TEXT_MUTED=#6c7086
VITE_BORDER_COLOR=#45475a
VITE_LEFT_PANEL_WIDTH=280
VITE_EDITOR_FONT_SIZE=14
VITE_EDITOR_HEIGHT_PERCENT=60     # Editor vs results split
```

### Performance
```env
VITE_AUTOCOMPLETE_DEBOUNCE_MS=400  # Delay before calling AI while typing
VITE_AUTOCOMPLETE_MAX_TOKENS=20    # Keep low for speed
DBAI_QUERY_TIMEOUT_SEC=30
DBAI_DEFAULT_QUERY_LIMIT=1000
DBAI_MONITOR_POLL_INTERVAL_SEC=2
```

---

## Prerequisites

- **Python 3.11+**
- **Node.js 18+** and npm
- **ODBC Driver 17 for SQL Server** (if using MSSQL) — [download](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server)
- At least one AI provider API key

---

## Setup & Run

### 1. Install dependencies

```bat
setup.bat
```

This installs Python packages, npm packages, and creates `.env` from the template.

### 2. Configure API keys

Edit `.env` and add at least one AI provider key:

```env
ANTHROPIC_API_KEY=sk-ant-...
DBAI_ACTIVE_AI_PROVIDER=anthropic
```

### 3. Launch

```bat
start.bat
```

Opens two terminal windows — backend (port 8000) and Electron frontend.

### Manual launch (without Electron)

```bash
# Terminal 1 — Backend
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2 — Frontend (browser mode)
cd frontend
npm run dev
# Then open http://localhost:15173
```

---

## Usage Guide

### Connecting to a Database

1. Click **🔌 Connections** in the left tab rail
2. Click **+** to add a new connection profile
3. Fill in the form (host, port, database, user, password)
4. Click **Test Connection** to verify, then **Save**
5. Click **Connect** — schema loads automatically in the background

### Writing Queries

- **Type** in the editor — AI suggests the next tokens (ghost text, muted italic)
- **Press Tab** — AI generates a full query from your current context
- **Ctrl+Enter** — Execute the query; results appear in the bottom pane
- **Drag-drop a `.sql` file** — Each statement opens in its own tab

### AI Features

| Action | How |
|--------|-----|
| Inline suggestion | Just type — appears automatically after 400ms pause |
| Full query (Tab) | Press Tab when nothing is selected |
| Text-to-SQL | Type in the **Ask AI:** bar and press Enter or → SQL |
| Analyze query | Click **🔍 Analyze** — see issues, suggestions, improved SQL |

### Switching AI Provider

- Click **📊 Monitor** → *coming: Settings panel* to switch provider via UI
- Or update `.env` and restart: `DBAI_ACTIVE_AI_PROVIDER=openai`
- Or call the API directly: `PUT /api/ai/providers/openai { "is_active": true }`

### Query Explorer

- Click **📄 Queries** in the left tab rail
- **History** tab: every executed query with timing and row counts
- **Saved** tab: pinned queries you've explicitly saved
- Use the **search bar** to find any past query by content

### DB Monitor

- Click **📊 Monitor** in the top bar
- Shows live gauges: active connections, queries/sec, CPU%
- **Slow Query Heat Map**: color-coded by duration (green → yellow → red)

---

## Development

### Backend

```bash
# Run with auto-reload
python -m uvicorn backend.main:app --reload --port 8000

# Interactive API docs
open http://127.0.0.1:8000/docs
```

### Frontend

```bash
cd frontend

# Dev server (hot reload, proxies /api to backend)
npm run dev

# Electron dev mode (Vite + Electron together)
npm run electron:dev

# Build for production
npm run electron:build
```

### Adding a New AI Provider

1. Create `backend/agent/providers/myprovider.py` implementing `BaseAIProvider`
2. Register it in `backend/agent/registry.py` `_build()` and `list_providers()`
3. Add defaults to `backend/config.py` `PROVIDER_DEFAULTS`
4. Add `.env` variables (`MYPROVIDER_API_KEY`, `MYPROVIDER_DEFAULT_MODEL`)

### Adding a New Database Connector

1. Create `backend/connectors/mydb.py` implementing `BaseConnector`
2. Register it in `backend/connectors/registry.py` `_get_class()`
3. Add the driver to `backend/requirements.txt`
