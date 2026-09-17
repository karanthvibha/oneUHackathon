"""Shared LLM client.

The AI Tutor and Smart Notes both use the SAME model through Amazon Bedrock's
OpenAI-compatible endpoint, so there's one model and one place to configure it.

Config (in backend/.env):
    TUTOR_MODEL_ID   - model id (default openai.gpt-oss-120b)
    OPENAI_BASE_URL  - Bedrock OpenAI-compatible endpoint
    OPENAI_API_KEY   - your Amazon Bedrock API key
"""

from __future__ import annotations

import os

try:  # pragma: no cover - dependency optional at import time
    from openai import OpenAI
except ImportError:  # pragma: no cover
    OpenAI = None

_client = None


def _get_client():
    """Return a lazily-created OpenAI client, raising a clear error if misconfigured."""
    global _client
    if OpenAI is None:
        raise RuntimeError("openai is not installed. Run: pip install -r requirements.txt")
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Add your Amazon Bedrock API key to backend/.env "
            "(copy backend/.env.example to backend/.env and set OPENAI_API_KEY)."
        )
    if _client is None:
        _client = OpenAI()
    return _client


def complete(messages: list[dict], system_prompt: str | None = None) -> str:
    """Call the shared model via the Chat Completions API and return the reply text."""
    model_id = os.getenv("TUTOR_MODEL_ID", "openai.gpt-oss-120b")
    client = _get_client()

    full_messages = []
    if system_prompt:
        full_messages.append({"role": "system", "content": system_prompt})
    full_messages.extend(messages)

    response = client.chat.completions.create(model=model_id, messages=full_messages)

    if not response or not response.choices or not response.choices[0].message:
        raise RuntimeError(
            "Bedrock returned an empty response. Check that your Bedrock API key is valid "
            "and that you have access to the model in the Bedrock console."
        )
    text = (response.choices[0].message.content or "").strip()
    if not text:
        raise RuntimeError("Bedrock returned no text output.")
    return text
