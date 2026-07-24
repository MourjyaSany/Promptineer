import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Secrets live in backend/.env (git-ignored) — loaded before any service
# reads provider keys. Existing shell variables always win.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from .routers import admin, auth_routes, chat, files, insights  # noqa: E402
from .seed import ensure_schema, seed
from .services import model_gateway, optimization, pii_engine, rails_engine

app = FastAPI(
    title="Promptineering API",
    description="Enterprise AI Governance, Prompt Security & Token Optimization",
    version="2.0.0",
)

# Allowed browser origins. Local dev origins are always permitted; add your
# deployed frontend via PROMPTINEERING_CORS_ORIGINS (comma-separated). Any
# *.vercel.app origin (production + preview builds) is allowed by regex so a
# Vercel deploy works with no extra config.
_DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
_extra_origins = [o.strip() for o in
                  os.environ.get("PROMPTINEERING_CORS_ORIGINS", "").split(",")
                  if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_DEV_ORIGINS + _extra_origins,
    allow_origin_regex=os.environ.get("PROMPTINEERING_CORS_REGEX",
                                      r"https://.*\.vercel\.app"),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(chat.router)
app.include_router(files.router)
app.include_router(admin.router)
app.include_router(insights.router)


@app.on_event("startup")
def startup():
    ensure_schema()
    seed()
    optimization.warm_up()   # background LLMLingua model load, never blocks
    pii_engine.warm_up()     # background Presidio/spaCy load, never blocks


@app.get("/api/health")
def health():
    return {
        "status": "ok", "service": "promptineering",
        "engines": {
            "rails": rails_engine.engine_info(),
            "optimizer": optimization.engine_info(),
            "pii": pii_engine.engine_info(),
            "provider": model_gateway.active_provider(),
        },
    }
