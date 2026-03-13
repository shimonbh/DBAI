"""
BaseAIProvider — abstract interface all AI provider implementations must fulfill.
Agents use this interface; concrete implementations live in agent/providers/.
"""
from abc import ABC, abstractmethod
from typing import AsyncIterator


class BaseAIProvider(ABC):
    """
    Provider-agnostic interface for LLM completions.
    Each provider wraps a different SDK but exposes the same methods.
    """

    def __init__(self, api_key: str, default_model: str, base_url: str | None = None):
        self.api_key = api_key
        self.default_model = default_model
        self.base_url = base_url

    @abstractmethod
    async def complete(
        self,
        system: str,
        messages: list[dict],
        model: str | None = None,
        max_tokens: int = 500,
    ) -> str:
        """
        Return the full completion text.
        Args:
            system:     System prompt text.
            messages:   List of {"role": "user"|"assistant", "content": str}
            model:      Override the default model for this request.
            max_tokens: Maximum tokens to generate.
        """

    @abstractmethod
    async def stream(
        self,
        system: str,
        messages: list[dict],
        model: str | None = None,
        max_tokens: int = 50,
    ) -> AsyncIterator[str]:
        """
        Yield completion text chunks as they arrive (for low-latency autocomplete).
        """

    @abstractmethod
    def list_models(self) -> list[str]:
        """Return well-known model IDs supported by this provider."""
