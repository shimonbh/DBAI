"""
TextToSQLAgent — converts natural language descriptions to SQL queries.
"""
from backend.agent.registry import AIProviderRegistry
from backend.agent.prompts import SYSTEM_SQL_EXPERT, TEXT_TO_SQL, TEXT_TO_SQL_ASK, TEXT_TO_SQL_PLAN


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
        history: list[dict] | None = None,
        mode: str | None = None,   # 'ask' | 'plan' | 'write' (default)
        header_instruction: str = "",
    ) -> str:
        """Convert a natural language description to a SQL query.

        When `history` is provided the conversation is multi-turn: previous
        user/assistant messages are prepended so the AI can refine its answer.
        """
        ai, model = AIProviderRegistry.get(provider, model)
        system = SYSTEM_SQL_EXPERT.format(
            db_type=self.db_type,
            schema_context=self.schema_context,
        )
        # Only inject header instruction for pure SQL-writing modes
        if header_instruction and mode not in ('ask', 'plan'):
            system += header_instruction

        if history:
            # Multi-turn: carry the prior conversation, append the new request
            messages = [{"role": m["role"], "content": m["content"]} for m in history]
            messages.append({"role": "user", "content": description})
        else:
            # First turn: pick prompt template based on mode
            if mode == 'ask':
                tmpl = TEXT_TO_SQL_ASK
            elif mode == 'plan':
                tmpl = TEXT_TO_SQL_PLAN
            else:
                tmpl = TEXT_TO_SQL
            user_msg = tmpl.format(db_type=self.db_type, description=description)
            messages = [{"role": "user", "content": user_msg}]

        return await ai.complete(system, messages, model=model, max_tokens=max_tokens)
