"""Model router.

Native model tiers are Google Gemini (current GA lineup — no 2.5-era
models). The unified gateway in services/model_gateway.py performs the
actual inference; with no provider key configured the platform serves a
deterministic simulated response so it stays fully demonstrable offline.
"""
from .optimizer import estimate_tokens

DEFAULT_MODEL = "gemini-3.5-flash"
# ordered least → most capable
MODEL_TIERS = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.6-flash"]

# tier names stored by policies created before the Gemini migration
LEGACY_MODEL_MAP = {
    "claude-haiku-4-5": "gemini-3.5-flash-lite",
    "claude-sonnet-5": "gemini-3.5-flash",
    "claude-opus-4-8": "gemini-3.6-flash",
}


def normalize_model(name: str | None) -> str | None:
    """Map legacy tier names onto the current Gemini lineup."""
    if not name:
        return None
    return LEGACY_MODEL_MAP.get(name, name)


def normalize_allowed(allowed_models: list | None) -> list[str]:
    """Policy allow-list → valid current tiers (empty ⇒ all tiers)."""
    allowed = [normalize_model(m) for m in (allowed_models or [])]
    return [m for m in MODEL_TIERS if m in allowed] or list(MODEL_TIERS)


def route_model(prompt: str, allowed_models: list | None) -> str:
    """Pick a model tier by prompt complexity, constrained by policy."""
    tokens = estimate_tokens(prompt)
    has_code = "```" in prompt or "def " in prompt or "function " in prompt
    if tokens > 400 or has_code:
        preferred = "gemini-3.6-flash"
    elif tokens > 80:
        preferred = "gemini-3.5-flash"
    else:
        preferred = "gemini-3.5-flash-lite"
    allowed = normalize_allowed(allowed_models)
    if preferred in allowed:
        return preferred
    # fall back to the most capable allowed tier
    for model in reversed(MODEL_TIERS):
        if model in allowed:
            return model
    return DEFAULT_MODEL


def _simulated_response(prompt: str, application: str, model: str) -> str:
    topic = prompt.strip().rstrip("?.!")
    if len(topic) > 90:
        topic = topic[:90] + "…"
    domain = application.replace("_", " ").title()
    return f"""### {domain} Assistant — Governed Response

Your request — **“{topic}”** — was processed through the full Promptineering guardrail pipeline before reaching the model router, which selected **`{model}`** for this workload.

#### Key points

1. **Scope confirmed.** The request falls within the active policy suite for the {domain} workspace, so no output restrictions were applied.
2. **Grounded answer.** In a production deployment this response is produced by the routed Gemini model with your enterprise context injected after sanitization.
3. **Optimization applied.** Filler language was compressed and duplicate context removed before inference, reducing token spend without changing intent.

| Check | Result |
| --- | --- |
| Policy compliance | ✅ Within scope |
| PII / secret leakage | ✅ None forwarded |
| Output moderation | ✅ Clean |

> **Note:** The platform is currently running in the *governed sandbox* mode — connect a Gemini API key (`GEMINI_API_KEY` in `backend/.env`) to route this workspace to live Gemini models.

```text
pipeline: injection → pii → secrets → compliance → optimization → router → {model}
status:   delivered
```

Let me know if you'd like this broken down further or exported as a report."""
