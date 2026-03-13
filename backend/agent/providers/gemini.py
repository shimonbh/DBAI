"""
Google Gemini provider using the google-generativeai SDK.
"""
from typing import AsyncIterator
import google.generativeai as genai

from backend.agent.base import BaseAIProvider


class GeminiProvider(BaseAIProvider):
    """Wraps the Google Generative AI SDK for Gemini models."""

    def __init__(self, api_key: str, default_model: str = "gemini-2.0-flash", base_url=None):
        super().__init__(api_key, default_model, base_url)
        genai.configure(api_key=api_key)

    def _get_model(self, model: str | None) -> genai.GenerativeModel:
        return genai.GenerativeModel(model or self.default_model)

    async def complete(
        self,
        system: str,
        messages: list[dict],
        model: str | None = None,
        max_tokens: int = 500,
    ) -> str:
        # Combine system + user messages into Gemini's format
        prompt = self._build_prompt(system, messages)
        gen_model = self._get_model(model)
        response = await gen_model.generate_content_async(
            prompt,
            generation_config=genai.types.GenerationConfig(max_output_tokens=max_tokens),
        )
        return response.text

    async def stream(
        self,
        system: str,
        messages: list[dict],
        model: str | None = None,
        max_tokens: int = 50,
    ) -> AsyncIterator[str]:
        prompt = self._build_prompt(system, messages)
        gen_model = self._get_model(model)
        response = await gen_model.generate_content_async(
            prompt,
            generation_config=genai.types.GenerationConfig(max_output_tokens=max_tokens),
            stream=True,
        )
        async for chunk in response:
            if chunk.text:
                yield chunk.text

    def list_models(self) -> list[str]:
        return ["gemini-2.0-flash", "gemini-2.0-pro", "gemini-1.5-flash", "gemini-1.5-pro"]

    @staticmethod
    def _build_prompt(system: str, messages: list[dict]) -> str:
        """Flatten system + messages into a single prompt string for Gemini."""
        parts = [f"System: {system}\n"]
        for msg in messages:
            role = "User" if msg["role"] == "user" else "Assistant"
            parts.append(f"{role}: {msg['content']}")
        return "\n".join(parts)
