import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Deployment-portable engine selection:
#   DATABASE_URL           — full SQLAlchemy URL (e.g. managed Postgres). Wins
#                            when set. `postgres://` is normalised to
#                            `postgresql://` (SQLAlchemy dropped the old alias).
#                            Postgres also needs a driver installed (psycopg2).
#   PROMPTINEERING_DB_PATH — explicit SQLite file path (e.g. a mounted disk).
#   (default)              — SQLite next to the backend package, as before.
_database_url = os.environ.get("DATABASE_URL", "").strip()

if _database_url:
    if _database_url.startswith("postgres://"):
        _database_url = _database_url.replace("postgres://", "postgresql://", 1)
    engine = create_engine(_database_url, pool_pre_ping=True)
else:
    _db_path = os.environ.get("PROMPTINEERING_DB_PATH")
    DB_PATH = (Path(_db_path) if _db_path
               else Path(__file__).resolve().parent.parent / "promptineering.db")
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False}
    )

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
