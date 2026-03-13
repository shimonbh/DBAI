"""
Anthropic (Claude) provider using the official anthropic SDK.
"""
from typing import AsyncIterator
import anthropic

from backend.agent.base import BaseAIProvider


class AnthropicProvider(BaseAIProvider):
    """Wraps the Anthropic SDK for Claude models."""

    def __init__(self, api_key: str, default_model: str = "claude-sonnet-4-6", base_url=None):
        super().__init__(api_key, default_model, base_url)
        self._client = anthropic.AsyncAnthropic(api_key=api_key)

    async def complete(
        self,
        system: str,
        messages: list[dict],
        model: str | None = None,
        max_tokens: int = 500,
    ) -> str:
        response = await self._client.messages.create(
            model=model or self.default_model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        )
        return response.content[0].text

    async def stream(
        self,
        system: str,
        messages: list[dict],
        model: str | None = None,
        max_tokens: int = 50,
    ) -> AsyncIterator[str]:
        async with self._client.messages.stream(
            model=model or self.default_model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        ) as stream_ctx:
            async for text in stream_ctx.text_stream:
                yield text

    def list_models(self) -> list[str]:
        return [
            "claude-opus-4-6",
            "claude-sonnet-4-6",
            "claude-haiku-4-5-20251001",
        ]
