"""
LLM Provider Abstraction Layer

This module provides a unified interface for different LLM providers.
All providers use OpenAI-compatible API format.
"""

from abc import ABC, abstractmethod
from typing import List, Dict, AsyncGenerator, Optional
from openai import AsyncOpenAI
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


# OpenRouter models are centrally configured here for easy future updates.
OPENROUTER_MODELS = [
    {"id": "x-ai/grok-4-fast", "name": "grok"},
    {"id": "google/gemini-3-flash-preview", "name": "gemini"},
    {"id": "anthropic/claude-sonnet-4.6", "name": "claude"},
]


# Provider configuration
PROVIDER_CONFIG = {
    'deepseek': {
        'name': 'DeepSeek',
        'base_url': 'https://api.deepseek.com/v1',
        'default_model': 'deepseek-chat',
        'reasoning_model': 'deepseek-reasoner',
        'supports_reasoning': True,
    },
    'qwen': {
        'name': 'Qwen (通义千问)',
        'base_url': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        'default_model': 'qwen-max',
        'reasoning_model': None,  # No reasoning model yet
        'supports_reasoning': False,
    },
    'openrouter': {
        'name': 'OpenRouter',
        'base_url': 'https://openrouter.ai/api/v1',
        'default_model': OPENROUTER_MODELS[0]['id'],
        'reasoning_model': None,  # User-selectable model list; no fixed reasoning model alias.
        'supports_reasoning': True,
        'available_models': OPENROUTER_MODELS,
    },
}


class LLMProvider(ABC):
    """Base class for LLM providers"""

    def __init__(self, api_key: str, base_url: str = None, default_model_override: str = None):
        self.api_key = api_key
        self.base_url = base_url
        self.default_model_override = default_model_override
        self.client = None
        self._initialize_client()

    def _initialize_client(self):
        """Initialize the OpenAI-compatible client"""
        if not self.api_key:
            raise ValueError("API密钥未配置")
        self.client = AsyncOpenAI(
            api_key=self.api_key,
            base_url=self.base_url
        )

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the provider name"""
        pass

    @property
    @abstractmethod
    def default_model(self) -> str:
        """Return the default model for this provider"""
        pass

    @property
    def supports_reasoning(self) -> bool:
        """Whether this provider supports reasoning models"""
        return False

    @property
    def reasoning_model(self) -> Optional[str]:
        """Return the reasoning model name if supported"""
        return None

    async def chat_completion_stream(
        self,
        messages: List[Dict],
        model: str = None,
        max_tokens: int = None,
        temperature: float = None,
        top_p: float = None,
        frequency_penalty: float = None,
        presence_penalty: float = None
    ) -> AsyncGenerator[str, None]:
        """
        Stream chat completion responses.

        Args:
            messages: List of message dicts with 'role' and 'content'
            model: Model to use (defaults to provider's default)
            max_tokens: Maximum tokens in response
            temperature: Sampling temperature
            top_p: Top-p sampling
            frequency_penalty: Frequency penalty
            presence_penalty: Presence penalty

        Yields:
            Text chunks from the response
        """
        model = model or self.default_model

        # Build request parameters
        params = {
            "model": model,
            "messages": messages,
            "stream": True,
        }

        # Add optional parameters if provided
        if max_tokens is not None:
            params["max_tokens"] = max_tokens
        if temperature is not None:
            params["temperature"] = temperature
        if top_p is not None:
            params["top_p"] = top_p
        if frequency_penalty is not None:
            params["frequency_penalty"] = frequency_penalty
        if presence_penalty is not None:
            params["presence_penalty"] = presence_penalty

        logger.debug(f"[{self.provider_name}] Streaming request with model: {model}")

        try:
            response = await self.client.chat.completions.create(**params)
            reasoning_started = False
            answer_started = False

            async for chunk in response:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta

                    # Handle reasoning content (for providers that support it)
                    if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                        if not reasoning_started:
                            yield "【思考过程】\n"
                            reasoning_started = True
                        yield delta.reasoning_content

                    # Handle regular content
                    if delta.content:
                        if reasoning_started and not answer_started:
                            yield "\n\n【回答】\n"
                            answer_started = True
                        yield delta.content

        except Exception as e:
            logger.error(f"[{self.provider_name}] Streaming error: {str(e)}")
            raise

    async def chat_completion(
        self,
        messages: List[Dict],
        model: str = None,
        max_tokens: int = None,
        temperature: float = None,
        top_p: float = None,
        frequency_penalty: float = None,
        presence_penalty: float = None
    ) -> str:
        """
        Non-streaming chat completion.

        Returns:
            Complete response text
        """
        model = model or self.default_model

        # Build request parameters
        params = {
            "model": model,
            "messages": messages,
            "stream": False,
        }

        # Add optional parameters if provided
        if max_tokens is not None:
            params["max_tokens"] = max_tokens
        if temperature is not None:
            params["temperature"] = temperature
        if top_p is not None:
            params["top_p"] = top_p
        if frequency_penalty is not None:
            params["frequency_penalty"] = frequency_penalty
        if presence_penalty is not None:
            params["presence_penalty"] = presence_penalty

        logger.debug(f"[{self.provider_name}] Non-streaming request with model: {model}")

        try:
            response = await self.client.chat.completions.create(**params)

            result = ""
            if response.choices and len(response.choices) > 0:
                message = response.choices[0].message

                # Handle reasoning content
                if hasattr(message, 'reasoning_content') and message.reasoning_content:
                    result = f"【思考过程】\n{message.reasoning_content}\n【回答】\n"

                if message.content:
                    result += message.content

            return result

        except Exception as e:
            logger.error(f"[{self.provider_name}] Chat completion error: {str(e)}")
            raise


class DeepSeekProvider(LLMProvider):
    """DeepSeek API provider"""

    def __init__(self, api_key: str, default_model_override: str = None):
        config = PROVIDER_CONFIG['deepseek']
        base_url = getattr(settings, 'DEEPSEEK_API_BASE', config['base_url'])
        super().__init__(api_key, base_url, default_model_override=default_model_override)
        self._config = config

    @property
    def provider_name(self) -> str:
        return "DeepSeek"

    @property
    def default_model(self) -> str:
        if self.default_model_override:
            return self.default_model_override
        return self._config['default_model']

    @property
    def supports_reasoning(self) -> bool:
        return self._config['supports_reasoning']

    @property
    def reasoning_model(self) -> Optional[str]:
        return self._config['reasoning_model']


class QwenProvider(LLMProvider):
    """Qwen (通义千问) API provider - Alibaba Cloud"""

    def __init__(self, api_key: str, default_model_override: str = None):
        config = PROVIDER_CONFIG['qwen']
        base_url = getattr(settings, 'QWEN_API_BASE', config['base_url'])
        super().__init__(api_key, base_url, default_model_override=default_model_override)
        self._config = config

    @property
    def provider_name(self) -> str:
        return "Qwen"

    @property
    def default_model(self) -> str:
        if self.default_model_override:
            return self.default_model_override
        return self._config['default_model']

    @property
    def supports_reasoning(self) -> bool:
        return self._config['supports_reasoning']

    @property
    def reasoning_model(self) -> Optional[str]:
        return self._config['reasoning_model']


class OpenRouterProvider(LLMProvider):
    """OpenRouter provider using OpenAI-compatible format with reasoning options."""

    def __init__(self, api_key: str, default_model_override: str = None):
        config = PROVIDER_CONFIG['openrouter']
        base_url = getattr(settings, 'OPENROUTER_API_BASE', config['base_url'])
        super().__init__(api_key, base_url, default_model_override=default_model_override)
        self._config = config

    @property
    def provider_name(self) -> str:
        return "OpenRouter"

    @property
    def default_model(self) -> str:
        if self.default_model_override:
            return self.default_model_override
        return self._config['default_model']

    @property
    def supports_reasoning(self) -> bool:
        return self._config['supports_reasoning']

    @property
    def reasoning_model(self) -> Optional[str]:
        return self._config['reasoning_model']

    def _build_reasoning_payload(self) -> Dict:
        # Keep this simple for now per requirement.
        return {
            "effort": "medium",
            "exclude": False,
            "enabled": True,
        }

    @staticmethod
    def _should_retry_without_reasoning(error: Exception) -> bool:
        message = str(error).lower()
        return "reasoning" in message or "unsupported" in message or "invalid" in message

    async def chat_completion_stream(
        self,
        messages: List[Dict],
        model: str = None,
        max_tokens: int = None,
        temperature: float = None,
        top_p: float = None,
        frequency_penalty: float = None,
        presence_penalty: float = None
    ) -> AsyncGenerator[str, None]:
        model = model or self.default_model
        params = {
            "model": model,
            "messages": messages,
            "stream": True,
        }

        if max_tokens is not None:
            params["max_tokens"] = max_tokens
        if temperature is not None:
            params["temperature"] = temperature
        if top_p is not None:
            params["top_p"] = top_p
        if frequency_penalty is not None:
            params["frequency_penalty"] = frequency_penalty
        if presence_penalty is not None:
            params["presence_penalty"] = presence_penalty

        logger.debug(f"[{self.provider_name}] Streaming request with model: {model}")

        try:
            try:
                response = await self.client.chat.completions.create(
                    **params,
                    reasoning=self._build_reasoning_payload()
                )
            except Exception as e:
                if not self._should_retry_without_reasoning(e):
                    raise
                logger.warning(
                    f"[{self.provider_name}] Reasoning payload rejected for model {model}, retrying without reasoning: {e}"
                )
                response = await self.client.chat.completions.create(**params)
            reasoning_started = False
            answer_started = False

            async for chunk in response:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                        if not reasoning_started:
                            yield "【思考过程】\n"
                            reasoning_started = True
                        yield delta.reasoning_content
                    if delta.content:
                        if reasoning_started and not answer_started:
                            yield "\n\n【回答】\n"
                            answer_started = True
                        yield delta.content
        except Exception as e:
            logger.error(f"[{self.provider_name}] Streaming error: {str(e)}")
            raise

    async def chat_completion(
        self,
        messages: List[Dict],
        model: str = None,
        max_tokens: int = None,
        temperature: float = None,
        top_p: float = None,
        frequency_penalty: float = None,
        presence_penalty: float = None
    ) -> str:
        model = model or self.default_model
        params = {
            "model": model,
            "messages": messages,
            "stream": False,
        }

        if max_tokens is not None:
            params["max_tokens"] = max_tokens
        if temperature is not None:
            params["temperature"] = temperature
        if top_p is not None:
            params["top_p"] = top_p
        if frequency_penalty is not None:
            params["frequency_penalty"] = frequency_penalty
        if presence_penalty is not None:
            params["presence_penalty"] = presence_penalty

        logger.debug(f"[{self.provider_name}] Non-streaming request with model: {model}")

        try:
            try:
                response = await self.client.chat.completions.create(
                    **params,
                    reasoning=self._build_reasoning_payload()
                )
            except Exception as e:
                if not self._should_retry_without_reasoning(e):
                    raise
                logger.warning(
                    f"[{self.provider_name}] Reasoning payload rejected for model {model}, retrying without reasoning: {e}"
                )
                response = await self.client.chat.completions.create(**params)
            result = ""
            if response.choices and len(response.choices) > 0:
                message = response.choices[0].message
                if hasattr(message, 'reasoning_content') and message.reasoning_content:
                    result = f"【思考过程】\n{message.reasoning_content}\n【回答】\n"
                if message.content:
                    result += message.content
            return result
        except Exception as e:
            logger.error(f"[{self.provider_name}] Chat completion error: {str(e)}")
            raise


def get_provider(provider_name: str, api_key: str, default_model: str = None) -> LLMProvider:
    """
    Factory function to get the appropriate provider instance.

    Args:
        provider_name: Name of the provider ('deepseek', 'qwen', etc.)
        api_key: API key for the provider

    Returns:
        LLMProvider instance

    Raises:
        ValueError: If provider is not supported
    """
    providers = {
        'deepseek': DeepSeekProvider,
        'qwen': QwenProvider,
        'openrouter': OpenRouterProvider,
    }

    provider_class = providers.get(provider_name.lower())
    if not provider_class:
        raise ValueError(f"不支持的API提供商: {provider_name}")

    return provider_class(api_key, default_model_override=default_model)


def get_provider_config(provider_name: str) -> dict:
    """Get configuration for a provider"""
    config = PROVIDER_CONFIG.get(provider_name.lower())
    if not config:
        raise ValueError(f"不支持的API提供商: {provider_name}")
    return config


def get_available_providers() -> List[Dict]:
    """Get list of available providers with their info"""
    return [
        {
            'id': key,
            'name': config['name'],
            'default_model': config['default_model'],
            'supports_reasoning': config['supports_reasoning'],
            'available_models': config.get('available_models', []),
        }
        for key, config in PROVIDER_CONFIG.items()
    ]
