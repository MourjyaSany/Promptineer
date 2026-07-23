"""Unified model gateway.

One interface in front of every supported LLM provider so the frontend and
the prompt pipeline never change when the provider does:

    LLM_PROVIDER = anthropic | openai | gemini | openrouter   (env var)

Keys (env vars): ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY,
OPENROUTER_API_KEY. With no key configured, the gateway serves the governed
sandbox (deterministic simulated responses) so the full pipeline remains
demonstrable offline.
"""
import logging
import os

import httpx

from ..llm import DEFAULT_MODEL, MODEL_TIERS, route_model, _simulated_response
from ..optimizer import estimate_tokens

log = logging.getLogger("promptineering.gateway")

__all__ = ["route_model", "generate", "active_provider", "MODEL_TIERS",
           "DEFAULT_MODEL"]

# claude tier -> rough equivalent on other providers
_MODEL_MAP = {
    "openai": {"claude-haiku-4-5": "gpt-4o-mini", "claude-sonnet-5": "gpt-4o",
               "claude-opus-4-8": "gpt-4o"},
    "gemini": {"claude-haiku-4-5": "gemini-2.0-flash", "claude-sonnet-5": "gemini-2.5-pro",
               "claude-opus-4-8": "gemini-2.5-pro"},
    "openrouter": {"claude-haiku-4-5": "anthropic/claude-haiku-4.5",
                   "claude-sonnet-5": "anthropic/claude-sonnet-5",
                   "claude-opus-4-8": "anthropic/claude-opus-4.8"},
}

_KEY_VARS = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
}


def active_provider() -> str:
    """Explicit LLM_PROVIDER wins; otherwise first provider with a key; else sandbox."""
    if os.environ.get("PROMPTINEERING_OFFLINE") == "1":
        return "sandbox"
    explicit = os.environ.get("LLM_PROVIDER", "").lower().strip()
    if explicit in _KEY_VARS:
        return explicit if os.environ.get(_KEY_VARS[explicit]) else "sandbox"
    for provider, var in _KEY_VARS.items():
        if os.environ.get(var):
            return provider
    return "sandbox"


def _system_prompt(application: str, workspace_prompt: str, strictness: str) -> str:
    base = workspace_prompt or (
        "You are Promptineering's governed enterprise assistant for the "
        f"'{application}' workspace. Answer in well-structured Markdown."
    )
    tone = {
        "relaxed": "Be helpful and creative; a conversational tone is fine.",
        "professional": "Maintain a precise, professional business tone.",
        "strict": ("Be strictly factual and conservative. Refuse speculation, "
                   "flag uncertainty explicitly, and never include sensitive data."),
    }.get(strictness, "Maintain a precise, professional business tone.")
    return f"{base}\n\n{tone}"


def _call_anthropic(prompt, model, system, max_tokens):
    import anthropic
    client = anthropic.Anthropic()
    response = client.messages.create(
        model=model, max_tokens=min(max_tokens, 8192), system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(b.text for b in response.content if b.type == "text")
    return {"text": text, "model": response.model,
            "tokens_out": response.usage.output_tokens}


def _call_openai(prompt, model, system, max_tokens):
    mapped = _MODEL_MAP["openai"].get(model, "gpt-4o")
    r = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"},
        json={"model": mapped, "max_tokens": min(max_tokens, 8192),
              "messages": [{"role": "system", "content": system},
                           {"role": "user", "content": prompt}]},
        timeout=120,
    )
    r.raise_for_status()
    data = r.json()
    return {"text": data["choices"][0]["message"]["content"], "model": mapped,
            "tokens_out": data.get("usage", {}).get("completion_tokens", 0)}


def _call_gemini(prompt, model, system, max_tokens):
    mapped = _MODEL_MAP["gemini"].get(model, "gemini-2.5-pro")
    r = httpx.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{mapped}:generateContent",
        params={"key": os.environ["GEMINI_API_KEY"]},
        json={"system_instruction": {"parts": [{"text": system}]},
              "contents": [{"role": "user", "parts": [{"text": prompt}]}],
              "generationConfig": {"maxOutputTokens": min(max_tokens, 8192)}},
        timeout=120,
    )
    r.raise_for_status()
    data = r.json()
    text = "".join(p.get("text", "")
                   for p in data["candidates"][0]["content"]["parts"])
    tokens = data.get("usageMetadata", {}).get("candidatesTokenCount", 0)
    return {"text": text, "model": mapped, "tokens_out": tokens}


def _call_openrouter(prompt, model, system, max_tokens):
    mapped = _MODEL_MAP["openrouter"].get(model, model)
    r = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}"},
        json={"model": mapped, "max_tokens": min(max_tokens, 8192),
              "messages": [{"role": "system", "content": system},
                           {"role": "user", "content": prompt}]},
        timeout=120,
    )
    r.raise_for_status()
    data = r.json()
    return {"text": data["choices"][0]["message"]["content"],
            "model": data.get("model", mapped),
            "tokens_out": data.get("usage", {}).get("completion_tokens", 0)}


_CALLERS = {"anthropic": _call_anthropic, "openai": _call_openai,
            "gemini": _call_gemini, "openrouter": _call_openrouter}


def generate(prompt: str, model: str, application: str, max_tokens: int = 2048,
             workspace_prompt: str = "", strictness: str = "professional") -> dict:
    provider = active_provider()
    system = _system_prompt(application, workspace_prompt, strictness)
    if provider != "sandbox":
        try:
            result = _CALLERS[provider](prompt, model, system, max_tokens)
            result.update({"simulated": False, "provider": provider})
            return result
        except Exception as exc:
            log.warning("%s gateway call failed, serving sandbox: %s", provider, exc)

    text = _simulated_response(prompt, application, model)
    return {"text": text, "model": f"{model} (governed sandbox)",
            "tokens_out": estimate_tokens(text), "simulated": True,
            "provider": "sandbox"}
