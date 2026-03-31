"""
AIProviderRegistry — resolves the active AI provider from settings.
Reads config from SQLite (ai_provider_settings) falling back to env vars.
"""
from backend.agent.base import BaseAIProvider


class AIProviderRegistry:
    """
    Resolves provider name → BaseAIProvider instance.
    Lazily imports provider classes to avoid loading unused SDKs.
    """

    @classmethod
    def get(
        cls,
        provider_name: str | None = None,
        model: str | None = None,
    ) -> tuple[BaseAIProvider, str | None]:
        """
        Return (provider_instance, model_to_use).
        If provider_name is None, uses the active provider from DB / env.
        model is None when the provider's default should be used.
        """
        if not provider_name:
            provider_name = cls._get_active_provider_name()

        settings = cls._load_settings(provider_name)
        provider = cls._build(provider_name, settings)
        return provider, model  # model=None → provider uses its default

    @classmethod
    def _get_active_provider_name(cls) -> str:
        """Read the active provider from SQLite, fall back to env."""
        try:
            from backend.storage.database import get_session
            from backend.storage.repositories import AIProviderRepo
            with get_session() as session:
                active = AIProviderRepo(session).get_active()
                if active:
                    return active.provider_name
        except Exception:
            pass
        from backend.config import ACTIVE_AI_PROVIDER
        return ACTIVE_AI_PROVIDER

    @classmethod
    def _load_settings(cls, provider_name: str) -> dict:
        """
        Load API key and default model from SQLite; fall back to env vars.
        """
        from backend.config import PROVIDER_DEFAULTS
        env_defaults = PROVIDER_DEFAULTS.get(provider_name, {})

        try:
            from backend.storage.database import get_session
            from backend.storage.repositories import AIProviderRepo
            with get_session() as session:
                row = AIProviderRepo(session).get_by_name(provider_name)
                if row:
                    return {
                        "api_key":       row.api_key or env_defaults.get("api_key", ""),
                        "default_model": row.default_model or env_defaults.get("default_model", ""),
                        "base_url":      row.base_url or env_defaults.get("base_url"),
                    }
        except Exception:
            pass

        return {
            "api_key":       env_defaults.get("api_key", ""),
            "default_model": env_defaults.get("default_model", ""),
            "base_url":      env_defaults.get("base_url"),
        }

    @staticmethod
    def _build(provider_name: str, settings: dict) -> BaseAIProvider:
        """Instantiate the correct provider class."""
        api_key = settings.get("api_key") or ""
        model   = settings.get("default_model") or ""
        url     = settings.get("base_url")

        if provider_name == "anthropic":
            from backend.agent.providers.anthropic import AnthropicProvider
            return AnthropicProvider(api_key=api_key, default_model=model)

        if provider_name == "openai":
            from backend.agent.providers.openai import OpenAIProvider
            return OpenAIProvider(api_key=api_key, default_model=model)

        if provider_name == "gemini":
            from backend.agent.providers.gemini import GeminiProvider
            return GeminiProvider(api_key=api_key, default_model=model)

        if provider_name == "openrouter":
            from backend.agent.providers.openrouter import OpenRouterProvider
            return OpenRouterProvider(api_key=api_key, default_model=model, base_url=url)

        if provider_name == "lmstudio":
            from backend.agent.providers.lmstudio import LMStudioProvider
            return LMStudioProvider(api_key=api_key, default_model=model, base_url=url)

        raise ValueError(f"Unknown AI provider: '{provider_name}'")

    @staticmethod
    def list_providers() -> list[str]:
        return ["anthropic", "openai", "gemini", "openrouter", "lmstudio"]
