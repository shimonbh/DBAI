"""
InlineAutocompleteAgent — provides fast next-token suggestions while the user types.
Designed for low latency: uses streaming and a small token budget.
"""
import os
from backend.agent.registry import AIProviderRegistry
from backend.agent.prompts import SYSTEM_SQL_EXPERT, INLINE_AUTOCOMPLETE
_MAX_TOKENS = int(os.getenv("VITE_AUTOCOMPLETE_MAX_TOKENS", "20"))


class InlineAutocompleteAgent:
    """
    Suggests the next few SQL tokens based on what the user has typed so far.
    Streaming is used to return the first token as fast as possible.
    """

    def __init__(self, db_type: str, schema_context: str):
        self.db_type = db_type
        self.schema_context = schema_context

    async def suggest(
        self,
        partial_sql: str,
        provider: str | None = None,
        model: str | None = None,
    ) -> str:
        """Return a short inline completion for the partial SQL."""
        if not partial_sql.strip():
            return ""

        ai, model = AIProviderRegistry.get(provider, model)
        system = SYSTEM_SQL_EXPERT.format(
            db_type=self.db_type,
            schema_context=self.schema_context,
        )
        user_msg = INLINE_AUTOCOMPLETE.format(partial_sql=partial_sql)
        messages = [{"role": "user", "content": user_msg}]

        # Collect streamed tokens up to limit
        result: list[str] = []
        async for token in ai.stream(system, messages, model=model, max_tokens=_MAX_TOKENS):
            result.append(token)
            if len("".join(result)) > 80:
                break  # Hard cap on suggestion length

        return "".join(result).strip()
