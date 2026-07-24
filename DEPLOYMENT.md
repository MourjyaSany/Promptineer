# Deploying Promptineering

Promptineering is a **two-service app**, so it deploys to two places:

| Piece | What it is | Where it goes | Why |
|---|---|---|---|
| **Frontend** | React + Vite static SPA | **Vercel** | Static hosting + global CDN; what Vercel is built for. |
| **Backend** | FastAPI + SQLite server | **Render** (container/web service) | A long-lived Python process with a database and file uploads — this **cannot** run on Vercel's serverless functions. |

> **Why not the whole thing on Vercel?** Vercel functions are stateless, have a
> read-only filesystem, a ~250 MB bundle limit, and short execution windows.
> The backend keeps a SQLite database, writes uploaded files, holds warm
> in-memory engines, and (optionally) loads multi-GB ML models. It needs a real
> server. Render's free web-service tier is the simplest fit; Railway and Fly.io
> work too (a `Dockerfile` is included for them).

The deployed backend runs in **native + Gemini mode**: the guardrail pipeline
executes on the built-in regex/heuristic engines and Gemini does the actual
inference. The heavy engines (torch / NeMo / Presidio / LLMLingua) are **not**
installed in the container — they need several GB of RAM and don't fit free
tiers — and the app degrades to the native engines automatically. Everything
you tested locally still works; only Presidio's NER names and the NeMo
LLM-judged self-check fall back to the pattern engines.

---

## Step 1 — Deploy the backend to Render

1. Push your latest commit to GitHub (already done if you followed along).
2. Go to <https://dashboard.render.com> → **New → Blueprint**.
3. Connect the `MourjyaSany/Promptineer` repo. Render detects **`render.yaml`**
   and shows the `promptineer-api` web service.
4. Click **Apply**. Render then prompts for the env vars marked `sync: false`:
   - **`GEMINI_API_KEY`** → paste your Gemini key.
   - **`PROMPTINEERING_CORS_ORIGINS`** → leave blank for now (you'll add the
     Vercel URL in Step 3; any `*.vercel.app` origin is already allowed).
   - `PROMPTINEERING_SECRET` is generated for you; `LLM_PROVIDER=gemini` and the
     upload dir are preset.
5. Wait for the build. When it's live, open
   `https://<your-service>.onrender.com/api/health` — you should see
   `"status": "ok"` and `"provider": "gemini"`.
6. **Copy the service URL** (e.g. `https://promptineer-api.onrender.com`) — you
   need it for the frontend.

> **Free-tier notes:** the service sleeps after ~15 min idle, so the first
> request after a nap takes ~30–50 s to wake. The filesystem is ephemeral — the
> demo database reseeds on each deploy/restart (fine for a portfolio demo). For
> persistence, attach a Render Disk and point `PROMPTINEERING_DB_PATH` /
> `PROMPTINEERING_UPLOAD_DIR` at it, or set `DATABASE_URL` to a managed Postgres
> (add `psycopg2-binary` to `requirements.txt`).

### Backend on Railway or Fly.io instead

- **Railway** — New Project → Deploy from GitHub → set **Root Directory** to
  `backend`. Railway uses the included `Dockerfile` (or Nixpacks). Add the same
  env vars (`GEMINI_API_KEY`, `LLM_PROVIDER=gemini`, `PROMPTINEERING_SECRET`).
  Railway injects `$PORT` automatically.
- **Fly.io** — from `backend/`: `fly launch` (it detects the `Dockerfile`),
  then `fly secrets set GEMINI_API_KEY=… PROMPTINEERING_SECRET=…` and
  `fly deploy`.

---

## Step 2 — Deploy the frontend to Vercel

1. Go to <https://vercel.com/new> and import the same GitHub repo.
2. Configure the project:
   - **Root Directory** → `frontend`
   - **Framework Preset** → Vite (auto-detected via `frontend/vercel.json`)
   - Build command / output are preset (`npm run build` → `dist`).
3. **Environment Variables** → add:
   - **`VITE_API_BASE`** = your Render backend URL from Step 1
     (e.g. `https://promptineer-api.onrender.com`) — **no trailing slash, no
     `/api`**.
4. Click **Deploy**. When it's done you get a `https://<project>.vercel.app` URL.

> `VITE_API_BASE` is read at **build time**. If you change it later, redeploy
> the frontend (Vercel → Deployments → Redeploy) so the new value is baked in.

### CLI alternative

```bash
npm i -g vercel
cd frontend
vercel                       # first run links/creates the project (needs login)
vercel env add VITE_API_BASE # paste the backend URL, choose Production
vercel --prod
```

---

## Step 3 — Connect them (CORS)

The backend already allows any `*.vercel.app` origin, so the default Vercel URL
works immediately. If you add a **custom domain** to the Vercel app, set the
backend env var so the browser is allowed to call it:

```
PROMPTINEERING_CORS_ORIGINS = https://your-custom-domain.com
```

(Comma-separate multiple origins.) Save → Render redeploys automatically.

---

## Step 4 — Verify end to end

1. Open the Vercel URL and sign in (`admin@promptineering.io` / `admin123`).
2. Send a prompt in a workspace. In **System Intelligence**, confirm the
   **LLM Inference** stage shows `gemini` and the model has no
   `(governed sandbox)` suffix.
3. Try the model dropdown, a PII prompt, and an injection prompt — the full
   governed pipeline runs against the live backend.

If responses say *governed sandbox*: the backend has no valid `GEMINI_API_KEY`
(check Render → Environment), or the frontend's `VITE_API_BASE` points at the
wrong URL (check the browser Network tab — calls should hit your Render domain).

---

## Environment variables reference

**Backend (Render/Railway/Fly):**

| Variable | Purpose |
|---|---|
| `LLM_PROVIDER` | `gemini` (set by the blueprint) |
| `GEMINI_API_KEY` | your Gemini key — **required** for live inference |
| `PROMPTINEERING_SECRET` | JWT signing secret (auto-generated on Render) |
| `PROMPTINEERING_CORS_ORIGINS` | extra allowed browser origins (custom domains), comma-separated |
| `PROMPTINEERING_UPLOAD_DIR` | writable upload path (`/tmp/uploads` on Render free) |
| `PROMPTINEERING_DB_PATH` | SQLite file path (use with a mounted disk for persistence) |
| `DATABASE_URL` | full DB URL to use managed Postgres instead of SQLite |

**Frontend (Vercel):**

| Variable | Purpose |
|---|---|
| `VITE_API_BASE` | backend origin, e.g. `https://promptineer-api.onrender.com` (build-time) |
