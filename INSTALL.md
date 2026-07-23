# Installing Promptineering from GitHub — Step-by-Step Manual

This manual takes you from `git clone` to a running platform on **any fresh
device** (Windows, macOS, or Linux). No prior knowledge of the project is
assumed.

---

## Step 0 — Install the prerequisites

| Tool | Minimum version | Download |
|---|---|---|
| Git | any recent | https://git-scm.com/downloads |
| Python | 3.11+ (3.12 recommended) | https://www.python.org/downloads (tick **"Add python.exe to PATH"** on Windows) |
| Node.js (includes npm) | 20+ | https://nodejs.org (LTS) |

Verify in a fresh terminal:

```bash
git --version
python --version    # macOS/Linux: python3 --version
node --version
npm --version
```

## Step 1 — Clone the repository

```bash
git clone https://github.com/MourjyaSany/Promptineer.git
cd Promptineer
```

## Step 2 — Set up the backend

**Windows (PowerShell):**
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
```

**macOS / Linux:**
```bash
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

This lightweight install (~50 MB) runs the platform with the built-in native
guardrail and optimizer engines.

> **Optional — full ML engines (NeMo Guardrails + LLMLingua, several GB):**
> only if you want real semantic compression and NeMo rail orchestration.
> Keep this venv **outside** cloud-synced folders (OneDrive/Dropbox):
> ```bash
> pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
> pip install --no-cache-dir llmlingua nemoguardrails
> ```
> The app detects them automatically; nothing else changes.

## Step 3 — Add your own API key (secrets file)

The platform runs fully **without any key** in "governed sandbox" mode
(simulated responses, real pipeline). To route to a real LLM:

1. Create a file named exactly **`.env`** inside the **`backend/`** folder
   (next to `requirements.txt`).

2. Put your provider and key in it — pick **one** block:

   ```dotenv
   # --- Anthropic (recommended) ---
   LLM_PROVIDER=anthropic
   ANTHROPIC_API_KEY=sk-ant-your-key-here

   # --- OR OpenAI ---
   # LLM_PROVIDER=openai
   # OPENAI_API_KEY=sk-your-key-here

   # --- OR Google Gemini ---
   # LLM_PROVIDER=gemini
   # GEMINI_API_KEY=your-key-here

   # --- OR OpenRouter ---
   # LLM_PROVIDER=openrouter
   # OPENROUTER_API_KEY=sk-or-your-key-here

   # JWT signing secret — change to any long random string
   PROMPTINEERING_SECRET=replace-with-a-long-random-string
   ```

3. That's it. The backend loads `backend/.env` automatically at startup.

**Where to get a key:** Anthropic → https://console.anthropic.com →
Settings → API Keys · OpenAI → https://platform.openai.com → API keys ·
Gemini → https://aistudio.google.com/apikey · OpenRouter →
https://openrouter.ai → Keys.

**Security notes**

- `.env` is listed in `.gitignore` — it will **never** be committed or
  pushed. Keep it that way; never paste keys into source files.
- To switch providers later, edit only the `LLM_PROVIDER` line and restart
  the backend. Nothing else in the project changes.
- Full provider details and troubleshooting: see `AI_API_SETUP.md`.

## Step 4 — Start the backend

From the `backend/` folder:

**Windows:**
```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

**macOS / Linux:**
```bash
./.venv/bin/python -m uvicorn app.main:app --port 8000
```

First boot creates and seeds the database automatically (policy suites,
workspaces, demo users, analytics history). Leave this terminal running.

Sanity check: open http://127.0.0.1:8000/api/health — you should see
`"status": "ok"` and, if you added a key, your provider name instead of
`"sandbox"`.

## Step 5 — Start the frontend

In a **second terminal**, from the repo root:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**.

## Step 6 — Log in

| Authority | Email | Password |
|---|---|---|
| Administrator | admin@promptineering.io | admin123 |
| Director | victor@promptineering.io | demo123 |
| Manager | priya@promptineering.io | demo123 |
| Senior | ken@promptineering.io | demo123 |
| Employee | amara@promptineering.io | demo123 |
| Intern | maria@promptineering.io | demo123 |

Try pasting this into any workspace to watch the guardrails work:

> My email is jane.doe@acme.com and my AWS key is AKIAIOSFODNN7EXAMPLE — please summarize our onboarding policy.

## Common issues

| Problem | Fix |
|---|---|
| `python` not found (Windows) | Reinstall Python with "Add to PATH" ticked, or use `py` instead of `python` |
| `pip install` SSL/proxy errors | Corporate network: add `--proxy http://your-proxy:port` or use a personal network |
| Port 8000 or 5173 already in use | Stop the other program, or run uvicorn with `--port 8001` and change the proxy target in `frontend/vite.config.ts` |
| PowerShell blocks venv activation | You don't need to activate — the commands above call the venv's python/pip directly |
| Responses say "governed sandbox" after adding a key | The `.env` must be in `backend/`, the variable name must match exactly, and the backend must be **restarted** |
| Reset all demo data | Stop the backend and delete `backend/promptineering.db`; it reseeds on next start |
