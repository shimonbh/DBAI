"""
TextToSQLAgent — converts natural language descriptions to SQL queries.
"""
from backend.agent.registry import AIProviderRegistry
from backend.agent.prompts import SYSTEM_SQL_EXPERT, TEXT_TO_SQL


class TextToSQLAgent:
    """Converts free-text user descriptions into valid SQL."""

    def __init__(self, db_type: str, schema_context: str):
        self.db_type = db_type
        self.schema_context = schema_context

    async def convert(
        self,
        description: str,
        provider: str | None = None,
        model: str | None = None,
        max_tokens: int = 800,
    ) -> str:
        """Convert a natural language description to a SQL query."""
        ai, model = AIProviderRegistry.get(provider, model)
        system = SYSTEM_SQL_EXPERT.format(
            db_type=self.db_type,
            schema_context=self.schema_context,
        )
        user_msg = TEXT_TO_SQL.format(db_type=self.db_type, description=description)
        messages = [{"role": "user", "content": user_msg}]

        return await ai.complete(system, messages, model=model, max_tokens=max_tokens)
