from pathlib import Path

from fastapi import FastAPI
from fastapi import status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from .config import settings
from .database import Base, engine, ensure_schema_compatibility
from .errors import api_error
from .routers import admin, auth, chat, payments, upload

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)
ensure_schema_compatibility()
settings.uploads_path.mkdir(parents=True, exist_ok=True)

app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(chat.router)
app.include_router(payments.router)
app.include_router(admin.router)

uploads_dir = Path(settings.uploads_path)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")


@app.get("/")
def root():
    return {"message": f"{settings.app_name} backend ready"}


@app.get("/health")
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:
        api_error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "DATABASE_ERROR",
            "Database connection failed",
            error=str(exc),
        )

    return {
        "status": "ok",
        "database": "connected",
        "groq_configured": bool(settings.groq_api_key),
        "openai_configured": bool(settings.openai_api_key),
    }
