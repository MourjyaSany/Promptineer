from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Secrets live in backend/.env (git-ignored) — loaded before any service
# reads provider keys. Existing shell variables always win.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from .routers import admin, auth_routes, chat, files, insights  # noqa: E402
from .seed import ensure_schema, seed
from .services import model_gateway, optimization, rails_engine

app = FastAPI(
    title="Promptineering API",
    description="Enterprise AI Governance, Prompt Security & Token Optimization",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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


@app.get("/api/health")
def health():
    return {
        "status": "ok", "service": "promptineering",
        "engines": {
            "rails": rails_engine.engine_info(),
            "optimizer": optimization.engine_info(),
            "provider": model_gateway.active_provider(),
        },
    }
