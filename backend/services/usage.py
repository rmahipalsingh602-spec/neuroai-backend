from datetime import date

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.config import settings
from backend.errors import api_error
from backend.models import User
from backend.schemas import UserSummary


def current_usage_month() -> date:
    today = date.today()
    return today.replace(day=1)


def refresh_usage_if_needed(db: Session, user: User) -> User:
    current_month = current_usage_month()
    if user.usage_month != current_month:
        user.usage_month = current_month
        user.usage_count = 0
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def ensure_query_allowed(user: User) -> None:
    if user.is_pro:
        return
    if user.usage_count >= settings.free_monthly_queries:
        api_error(
            status.HTTP_403_FORBIDDEN,
            "LIMIT_REACHED",
            f"Free plan limit reached. Upgrade Rs. 199 to continue after {settings.free_monthly_queries} queries.",
        )


def increment_usage(db: Session, user: User) -> User:
    if not user.is_pro:
        user.usage_count += 1
        db.add(user)
        db.flush()
    return user


def build_user_summary(user: User, document_count: int, payment_count: int, has_seen_onboarding: bool | None = None) -> UserSummary:
    usage_limit = 999999 if user.is_pro else settings.free_monthly_queries
    remaining_queries = 999999 if user.is_pro else max(settings.free_monthly_queries - user.usage_count, 0)
    return UserSummary(
        id=user.id,
        email=user.email,
        is_pro=user.is_pro,
        usage_count=user.usage_count,
        usage_limit=usage_limit,
        remaining_queries=remaining_queries,
        usage_month=user.usage_month,
        created_at=user.created_at,
        document_count=document_count,
        payment_count=payment_count,
        is_admin=user.email.lower() in settings.admin_emails,
        has_seen_onboarding=has_seen_onboarding or user.has_seen_onboarding,
    )
