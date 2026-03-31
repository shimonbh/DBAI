"""
LM Studio provider — OpenAI-compatible local inference server.
LM Studio runs on http://localhost:1234/v1 by default and requires no API key.
"""
from typing import AsyncIterator
from openai import AsyncOpenAI

from backend.agent.base import BaseAIProvider


class LMStudioProvider(BaseAIProvider):
    """
    Wraps the OpenAI-compatible LM Studio local server.
    The active model is whatever is currently loaded in LM Studio;
    list_models() fetches it live from the /v1/models endpoint.
    """

    def __init__(
        self,
        api_key: str = "lm-studio",          # LM Studio ignores the key; any string works
        default_model: str = "",             # empty → use whatever is loaded
        base_url: str = "http://localhost:1234/v1",
    ):
        super().__init__(api_key or "lm-studio", default_model, base_url)
        self._client = AsyncOpenAI(
            api_key=api_key or "lm-studio",
            base_url=base_url or "http://localhost:1234/v1",
        )

    async def complete(
        self,
        system: str,
        messages: list[dict],
        model: str | None = None,
        max_tokens: int = 500,
    ) -> str:
        full_messages = [{"role": "system", "content": system}] + messages
        response = await self._client.chat.completions.create(
            model=model or self.default_model or self._first_loaded_model(),
            max_tokens=max_tokens,
            messages=full_messages,
        )
        return response.choices[0].message.content or ""

    async def stream(
        self,
        system: str,
        messages: list[dict],
        model: str | None = None,
        max_tokens: int = 50,
    ) -> AsyncIterator[str]:
        full_messages = [{"role": "system", "content": system}] + messages
        async with await self._client.chat.completions.create(
            model=model or self.default_model or self._first_loaded_model(),
            max_tokens=max_tokens,
            messages=full_messages,
            stream=True,
        ) as stream_ctx:
            async for chunk in stream_ctx:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta

    def list_models(self) -> list[str]:
        """
        Return models currently loaded in LM Studio.
        Falls back to a placeholder string if the server is unreachable.
        """
        import asyncio, httpx
        try:
            resp = httpx.get(
                f"{self._client.base_url.rstrip('/')}/models",
                headers={"Authorization": f"Bearer {self._client.api_key}"},
                timeout=3,
            )
            data = resp.json()
            return [m["id"] for m in data.get("data", [])]
        except Exception:
            return ["<LM Studio model not loaded>"]

    def _first_loaded_model(self) -> str:
        """Synchronously fetch the first available model from LM Studio."""
        models = self.list_models()
        return models[0] if models and not models[0].startswith("<") else ""
