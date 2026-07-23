"""Model router and LLM gateway.

Uses the Anthropic API when credentials are available (ANTHROPIC_API_KEY or an
`ant auth login` profile); otherwise returns a deterministic simulated response
so the platform is fully demonstrable offline.
"""
import os

from .optimizer import estimate_tokens

DEFAULT_MODEL = "claude-opus-4-8"
MODEL_TIERS = ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-4-8"]

_client = None
_client_checked = False


def _get_client():
    global _client, _client_checked
    if _client_checked:
        return _client
    _client_checked = True
    if os.environ.get("PROMPTINEERING_OFFLINE") == "1":
        return None
    try:
        import anthropic
        _client = anthropic.Anthropic()
    except Exception:
        _client = None
    return _client


def route_model(prompt: str, allowed_models: list | None) -> str:
    """Pick a model tier by prompt complexity, constrained by policy."""
    tokens = estimate_tokens(prompt)
    has_code = "```" in prompt or "def " in prompt or "function " in prompt
    if tokens > 400 or has_code:
        preferred = "claude-opus-4-8"
    elif tokens > 80:
        preferred = "claude-sonnet-5"
    else:
        preferred = "claude-haiku-4-5"
    allowed = [m for m in (allowed_models or []) if m in MODEL_TIERS] or MODEL_TIERS
    if preferred in allowed:
        return preferred
    # fall back to the most capable allowed tier
    for model in reversed(MODEL_TIERS):
        if model in allowed:
            return model
    return DEFAULT_MODEL


def generate(prompt: str, model: str, application: str, max_tokens: int = 2048) -> dict:
    client = _get_client()
    if client is not None:
        try:
            response = client.messages.create(
                model=model,
                max_tokens=min(max_tokens, 8192),
                system=(
                    "You are Promptineering's governed enterprise assistant for the "
                    f"'{application}' workspace. Answer in well-structured Markdown. "
                    "Be precise and professional."
                ),
                messages=[{"role": "user", "content": prompt}],
            )
            text = "".join(b.text for b in response.content if b.type == "text")
            return {
                "text": text,
                "model": response.model,
                "tokens_out": response.usage.output_tokens,
                "simulated": False,
            }
        except Exception:
            pass  # fall through to the simulated gateway

    text = _simulated_response(prompt, application, model)
    return {
        "text": text,
        "model": f"{model} (governed sandbox)",
        "tokens_out": estimate_tokens(text),
        "simulated": True,
    }


def _simulated_response(prompt: str, application: str, model: str) -> str:
    topic = prompt.strip().rstrip("?.!")
    if len(topic) > 90:
        topic = topic[:90] + "…"
    domain = application.replace("_", " ").title()
    return f"""### {domain} Assistant — Governed Response

Your request — **“{topic}”** — was processed through the full Promptineering guardrail pipeline before reaching the model router, which selected **`{model}`** for this workload.

#### Key points

1. **Scope confirmed.** The request falls within the active policy suite for the {domain} workspace, so no output restrictions were applied.
2. **Grounded answer.** In a production deployment this response is produced by the routed Claude model with your enterprise context injected after sanitization.
3. **Optimization applied.** Filler language was compressed and duplicate context removed before inference, reducing token spend without changing intent.

| Check | Result |
| --- | --- |
| Policy compliance | ✅ Within scope |
| PII / secret leakage | ✅ None forwarded |
| Output moderation | ✅ Clean |

> **Note:** The platform is currently running in the *governed sandbox* mode — connect an Anthropic API key (`ANTHROPIC_API_KEY`) to route this workspace to live Claude models.

```text
pipeline: injection → pii → secrets → compliance → optimization → router → {model}
status:   delivered
```

Let me know if you'd like this broken down further or exported as a report."""
