try:
    from routers import admin, auth, chat, payments, upload
except ImportError:  # pragma: no cover - package import fallback
    from ..routers import admin, auth, chat, payments, upload

__all__ = ["admin", "auth", "chat", "payments", "upload"]
