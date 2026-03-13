"""
OpenRouter provider — uses the OpenAI-compatible API with a custom base_url.
Supports any model available on openrouter.ai.
"""
from backend.agent.providers.openai import OpenAIProvider


class OpenRouterProvider(OpenAIProvider):
    """
    OpenRouter exposes an OpenAI-compatible API, so we reuse OpenAIProvider
    with a custom base_url and any model string OpenRouter supports.
    """

    DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"

    def __init__(
        self,
        api_key: str,
        default_model: str = "anthropic/claude-3.5-sonnet",
        base_url: str | None = None,
    ):
        super().__init__(
            api_key=api_key,
            default_model=default_model,
            base_url=base_url or self.DEFAULT_BASE_URL,
        )

    def list_models(self) -> list[str]:
        # Popular OpenRouter model IDs — user can type any valid OR model ID
        return [
            "anthropic/claude-3.5-sonnet",
            "anthropic/claude-3-haiku",
            "openai/gpt-4o",
            "openai/gpt-4o-mini",
            "google/gemini-flash-1.5",
            "meta-llama/llama-3.1-70b-instruct",
            "mistralai/mixtral-8x7b-instruct",
        ]
