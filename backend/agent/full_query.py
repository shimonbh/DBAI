"""
FullQueryAgent — generates a complete SQL query when the user presses Tab.
Uses fuller context than inline autocomplete and a larger token budget.
"""
from backend.agent.registry import AIProviderRegistry
from backend.agent.prompts import SYSTEM_SQL_EXPERT, FULL_QUERY_GENERATION


class FullQueryAgent:
    """
    Generates or completes a full SQL query from the current editor context.
    Called when the user presses Tab in the editor.
    """

    def __init__(self, db_type: str, schema_context: str):
        self.db_type = db_type
        self.schema_context = schema_context

    async def generate(
        self,
        context: str,
        provider: str | None = None,
        model: str | None = None,
        max_tokens: int = 500,
    ) -> str:
        """Generate a complete SQL query from partial input / editor context."""
        ai, model = AIProviderRegistry.get(provider, model)
        system = SYSTEM_SQL_EXPERT.format(
            db_type=self.db_type,
            schema_context=self.schema_context,
        )
        user_msg = FULL_QUERY_GENERATION.format(context=context)
        messages = [{"role": "user", "content": user_msg}]

        return await ai.complete(system, messages, model=model, max_tokens=max_tokens)
