import os
from dataclasses import dataclass
from pathlib import Path


def _parse_csv(value: str, default: list[str]) -> list[str]:
    if not value:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


def _default_voice_temp_path() -> str:
    if os.getenv("VOICE_TEMP_PATH"):
        return os.getenv("VOICE_TEMP_PATH", "./uploads/voice-temp")
    if os.getenv("RENDER") == "true" or os.getenv("RENDER_SERVICE_ID"):
        return "/tmp/voice-temp"
    return "./uploads/voice-temp"


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "NeuroAI Pro")
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./neuroai.db")
    secret_key: str = os.getenv("SECRET_KEY", "change-me-in-production")
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
    free_monthly_queries: int = int(os.getenv("FREE_MONTHLY_QUERIES", "10"))
    uploads_path: Path = Path(os.getenv("UPLOADS_PATH", "./uploads"))
    voice_temp_path: Path = Path(_default_voice_temp_path())
    cors_origins: list[str] = tuple(
        _parse_csv(
            os.getenv("CORS_ORIGINS", ""),
            [
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:4173",
                "http://127.0.0.1:4173",
                "http://localhost:5173",
                "http://127.0.0.1:5173",
            ],
        )
    )
    cors_origin_regex: str = os.getenv(
        "CORS_ORIGIN_REGEX",
        r"^https://.*$",
    )
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    groq_model: str = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    razorpay_key_id: str = os.getenv("RAZORPAY_KEY_ID", "")
    razorpay_key_secret: str = os.getenv("RAZORPAY_KEY_SECRET", "")
    razorpay_plan_amount: int = int(os.getenv("RAZORPAY_PLAN_AMOUNT", "19900"))
    razorpay_currency: str = os.getenv("RAZORPAY_CURRENCY", "INR")
    admin_emails: set[str] = frozenset(
        email.lower() for email in _parse_csv(os.getenv("ADMIN_EMAILS", ""), [])
    )


settings = Settings()
