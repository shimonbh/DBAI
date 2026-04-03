"""
All LLM prompt templates used by AI agents.
Centralizing prompts here makes them easy to tune without touching agent logic.
"""

# ── System prompt (shared by all agents) ─────────────────────────────────────

SYSTEM_SQL_EXPERT = """\
You are an expert SQL assistant and database performance specialist.
You are connected to a {db_type} database. Always produce valid {db_type}-compatible SQL.

Database schema:
{schema_context}

Rules:
- Return only SQL code unless the user asks for explanations.
- Do not wrap SQL in markdown code blocks unless explicitly asked.
- Use the exact table and column names from the schema above.
- Prefer readable, well-formatted SQL with proper indentation.
"""

# ── Inline Autocomplete ───────────────────────────────────────────────────────

INLINE_AUTOCOMPLETE = """\
Complete the following partial SQL query by providing only the immediate next \
tokens (5-15 words maximum). Do not repeat the existing text. Return only the continuation.

Partial SQL:
{partial_sql}"""

# ── Full Query Generation (Tab key) ──────────────────────────────────────────

FULL_QUERY_GENERATION = """\
The user has started writing a SQL query. Generate the complete, correct, and \
well-formatted SQL query based on the context below.
Return only the SQL — no explanations, no markdown code blocks.

Context / partial query:
{context}"""

# ── Text to SQL ───────────────────────────────────────────────────────────────

TEXT_TO_SQL = """\
Convert the following natural language description into a valid {db_type} SQL query.
Use the provided schema to ensure correct table and column names.
Return only the SQL query — no explanations, no markdown code blocks.

Description: {description}"""

TEXT_TO_SQL_ASK = """\
The user has a question about the database, its schema, or SQL in general.
Answer helpfully and conversationally. Explain concepts clearly.
If a SQL example is useful, include it — but plain text explanations are fine too.

Question: {description}"""

TEXT_TO_SQL_PLAN = """\
Plan an approach for the following data requirement, then produce the SQL.

First, briefly outline your plan in 2-4 bullet points (what tables, joins, filters, aggregations are needed).
Then provide the complete, well-formatted {db_type} SQL query.

Requirement: {description}"""

# ── Query Analysis ────────────────────────────────────────────────────────────

QUERY_ANALYSIS = """\
Analyze the following {db_type} SQL query for correctness, performance, and best practices.

SQL:
{sql}

Provide your analysis in exactly this structure:

## Summary
[One paragraph describing what the query does]

## Issues
[Bullet list of problems found. If none, write "None."]

## Suggestions
[Bullet list of specific improvement suggestions. If none, write "None."]

## Improved SQL
[The rewritten, improved version of the query. If no changes needed, repeat the original.]
"""

# ── SQL Header Instruction (injected into system prompt when header is enabled) ─

SQL_HEADER_INSTRUCTION = """\

When returning SQL, always wrap it with this exact comment block (no exceptions):
-- ─────────────────────────────────────────────────────────────────────────────
-- Generated: {timestamp}
{author_line}-- Purpose  : <one-line description of what this query does>
-- ─────────────────────────────────────────────────────────────────────────────
<SQL here>
-- ─────────────────────────────────────────────────────────────────────────────
Fill in the Purpose line with a real one-sentence description of the query."""

# ── Query Namer ───────────────────────────────────────────────────────────────

QUERY_NAMER = """\
Given the following {db_type} SQL query, generate:
1. A short descriptive name (3-6 words, Title Case, no punctuation, no SQL keywords)
2. A single sentence describing what the query does

SQL:
{sql}

Respond in exactly this format (no extra text):

## Name
[Short name here]

## Description
[One sentence here]
"""
