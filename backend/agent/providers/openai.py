"""
OpenAI provider using the openai SDK.
Also used as the base for OpenRouter (which uses the same OpenAI-compatible API).
"""
from typing import AsyncIterator
from openai import AsyncOpenAI

from backend.agent.base import BaseAIProvider


class OpenAIProvider(BaseAIProvider):
    """Wraps the OpenAI async client for GPT models."""

    def __init__(self, api_key: str, default_model: str = "gpt-4o", base_url: str | None = None):
        super().__init__(api_key, default_model, base_url)
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    async def complete(
        self,
        system: str,
        messages: list[dict],
        model: str | None = None,
        max_tokens: int = 500,
    ) -> str:
        full_messages = [{"role": "system", "content": system}] + messages
        response = await self._client.chat.completions.create(
            model=model or self.default_model,
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
            model=model or self.default_model,
            max_tokens=max_tokens,
            messages=full_messages,
            stream=True,
        ) as stream_ctx:
            async for chunk in stream_ctx:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta

    def list_models(self) -> list[str]:
        return ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"]
