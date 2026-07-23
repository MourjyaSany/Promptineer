# Promptineering — AI Provider Configuration Guide

Out of the box the platform runs in a **governed sandbox**: the full pipeline
(policy engine → guardrails → compression → routing → output validation)
executes and a deterministic simulated response is returned. To route prompts
to a real LLM, configure one provider below. **No frontend changes are ever
needed** — the unified model gateway (`backend/app/services/model_gateway.py`)
abstracts every provider behind one interface.

## 1. Get an API key

Pick **one** provider (you can add more later):

### Anthropic (recommended — native model tiers)
1. Create an account at https://console.anthropic.com
2. Go to **Settings → API Keys → Create Key**
3. Copy the key — it starts with `sk-ant-`

### OpenAI
1. Create an account at https://platform.openai.com
2. **Dashboard → API keys → Create new secret key** (starts with `sk-`)

### Google Gemini
1. Visit https://aistudio.google.com/apikey
2. **Create API key** in a Google Cloud project

### OpenRouter (one key, many models)
1. Create an account at https://openrouter.ai
2. **Keys → Create Key** (starts with `sk-or-`)

## 2. Store the key securely

**Never hardcode keys in source code and never commit them to git.** Use
environment variables. The backend loads a `.env` file automatically if
`python-dotenv` finds one, or you can set variables in the shell.

Create `backend/.env` (this path is for local development; add `.env` to
`.gitignore` if you initialise a repo):

```dotenv
# choose ONE provider block --------------------------------------------
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# LLM_PROVIDER=openai
# OPENAI_API_KEY=sk-...

# LLM_PROVIDER=gemini
# GEMINI_API_KEY=...

# LLM_PROVIDER=openrouter
# OPENROUTER_API_KEY=sk-or-...

# platform secrets ------------------------------------------------------
PROMPTINEERING_SECRET=change-me-to-a-long-random-string
```

Or set them for the current PowerShell session before starting the backend:

```powershell
$env:LLM_PROVIDER = "anthropic"
$env:ANTHROPIC_API_KEY = "sk-ant-..."
```

## 3. How the backend uses the key

1. `model_gateway.active_provider()` reads `LLM_PROVIDER`; if unset, it
   auto-detects the first provider whose key variable exists; if none, it
   serves the sandbox.
2. The **model router** picks a Claude tier (`claude-haiku-4-5` /
   `claude-sonnet-5` / `claude-opus-4-8`) from prompt complexity, constrained
   by the active policy suite's `allowed_models`.
3. For non-Anthropic providers the gateway maps that tier to an equivalent
   model (e.g. `claude-sonnet-5 → gpt-4o` / `gemini-2.5-pro` /
   `anthropic/claude-sonnet-5` on OpenRouter).
4. The workspace's system prompt and the policy's response strictness are
   applied, the **compressed** prompt is sent, and the answer flows back
   through the output rails before reaching the UI.

Switching providers is therefore a one-line change of `LLM_PROVIDER` — the
frontend, policies and pipeline are untouched.

## 4. Run it

```powershell
# terminal 1 — backend (reads .env / session env vars)
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
# (or the full-engine venv — see SETUP.md)

# terminal 2 — frontend
cd frontend
npm run dev
```

## 5. Verify the full pipeline

1. `GET http://127.0.0.1:8000/api/health` → confirm
   `"provider": "anthropic"` (or your provider) instead of `"sandbox"`.
2. Sign in at http://localhost:5173 and send a prompt. In the **System
   Intelligence** panel confirm:
   - the **LLM Inference** stage shows your provider as its engine,
   - the model name has no `(governed sandbox)` suffix,
   - compression metrics show original vs optimized tokens and est. savings.
3. Confirm the pipeline order in the stage list:
   `Policy → Injection → Jailbreak → PII → Secrets → (Financial) →
   Compliance → Toxicity → Token Optimization → Model Router →
   LLM Inference → Output Validation`.

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Responses say *governed sandbox* | No key found, or the call failed | Check the env var name for your provider; restart the backend after setting it; check backend logs for the gateway warning |
| `401/403` from provider | Invalid or revoked key | Regenerate the key; ensure no quotes/spaces were pasted into the value |
| `429` errors | Provider rate limit or no credit | Add billing/credits on the provider dashboard; retry later; route to a smaller tier via the policy's `allowed_models` |
| CORS errors in the browser console | Frontend served from an origin the backend doesn't allow | In dev, always use http://localhost:5173 (the Vite proxy handles `/api`); for other origins add them to `allow_origins` in `backend/app/main.py` |
| Key works in terminal but not the app | Key set in a different shell than the backend process | Set the variable in the same window that launches uvicorn, or use `backend/.env` |
| NeMo self-check rail never runs | It requires `ANTHROPIC_API_KEY` + `nemoguardrails` installed + `self_check` enabled in the policy's rails config | Check `GET /api/health` → `engines.rails` |
| First request very slow with full engines | LLMLingua model downloading in the background | Wait for `llmlingua_state: "ready"` in `/api/health`; native engine serves meanwhile |

## 7. Production notes

- Set a strong `PROMPTINEERING_SECRET` (JWT signing).
- Store provider keys in your platform's secret manager (Azure Key Vault,
  AWS Secrets Manager, etc.), injected as environment variables — the code
  never needs to change.
- Rotate any key that ever appears in a prompt: the secret-detection rail
  masks patterns like `sk-ant-…` before they reach a model, and logs a
  violation so you can act.
