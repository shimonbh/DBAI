"""
QueryNamerAgent — generates a short name and one-sentence description for a SQL query.
Used by the AI Save feature to auto-label selected history entries.
"""
import re
from backend.agent.registry import AIProviderRegistry
from backend.agent.prompts import SYSTEM_SQL_EXPERT, QUERY_NAMER


class QueryNamerAgent:
    """Given a SQL query, returns a concise name and description via the active AI provider."""

    def __init__(self, db_type: str, schema_context: str):
        self.db_type = db_type
        self.schema_context = schema_context

    async def name(
        self,
        sql: str,
        provider: str | None = None,
        model: str | None = None,
        max_tokens: int = 200,
    ) -> dict:
        """Return {'name': str, 'description': str} for the given SQL."""
        ai, model = AIProviderRegistry.get(provider, model)
        system = SYSTEM_SQL_EXPERT.format(
            db_type=self.db_type,
            schema_context=self.schema_context,
        )
        user_msg = QUERY_NAMER.format(db_type=self.db_type, sql=sql)
        messages = [{"role": "user", "content": user_msg}]

        raw = await ai.complete(system, messages, model=model, max_tokens=max_tokens)
        return self._parse(raw)

    @staticmethod
    def _parse(raw: str) -> dict:
        def _extract(text: str, header: str) -> str:
            pattern = rf"##\s*{re.escape(header)}\s*\n(.*?)(?=##|\Z)"
            match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
            return match.group(1).strip() if match else ""

        name        = _extract(raw, "Name")
        description = _extract(raw, "Description")
        return {
            "name":        name        or "Unnamed Query",
            "description": description or "",
        }
