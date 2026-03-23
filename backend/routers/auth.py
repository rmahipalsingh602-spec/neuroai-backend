from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.auth import (
    authenticate_user,
    create_access_token,
    get_current_user,
    get_password_hash,
    issue_refresh_token,
    refresh_user_session,
    revoke_refresh_token,
)
from backend.database import get_db
from backend.errors import api_error
from backend.models import User
from backend.schemas import AuthRequest, AuthResponse, LogoutRequest, RefreshSessionRequest, UserSummary
from backend.services.usage import build_user_summary, refresh_usage_if_needed

router = APIRouter()


def build_auth_response(user: User, refresh_token: str) -> AuthResponse:
    return AuthResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=refresh_token,
        token_type="bearer",
        user=build_user_summary(
            user,
            document_count=len(user.documents),
            payment_count=len(user.payments),
            has_seen_onboarding=user.has_seen_onboarding,
        ),
    )


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: AuthRequest, db: Session = Depends(get_db)):
    email = payload.email.lower()
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        api_error(status.HTTP_400_BAD_REQUEST, "EMAIL_EXISTS", "Email already registered")

    user = User(email=email, password_hash=get_password_hash(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    refresh_token = issue_refresh_token(db, user)
    db.refresh(user)
    return build_auth_response(user, refresh_token)


@router.post("/login", response_model=AuthResponse)
def login(payload: AuthRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, payload.email, payload.password)
    if user is None:
        api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_ERROR", "Incorrect email or password")

    refresh_usage_if_needed(db, user)
    refresh_token = issue_refresh_token(db, user)
    db.refresh(user)
    return build_auth_response(user, refresh_token)


@router.post("/refresh", response_model=AuthResponse)
def refresh_session(payload: RefreshSessionRequest, db: Session = Depends(get_db)):
    user, refresh_token = refresh_user_session(db, payload.refresh_token)
    refresh_usage_if_needed(db, user)
    db.refresh(user)
    return build_auth_response(user, refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: LogoutRequest, db: Session = Depends(get_db)):
    revoke_refresh_token(db, payload.refresh_token)
    return None


@router.get("/me", response_model=UserSummary)
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    refresh_usage_if_needed(db, current_user)
    db.refresh(current_user)
    return build_user_summary(
        current_user,
        document_count=len(current_user.documents),
        payment_count=len(current_user.payments),
        has_seen_onboarding=current_user.has_seen_onboarding,
    )


@router.post("/me/onboarding-seen", response_model=UserSummary)
def mark_onboarding_seen(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.has_seen_onboarding = True
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return build_user_summary(
        current_user,
        document_count=len(current_user.documents),
        payment_count=len(current_user.payments),
        has_seen_onboarding=True,
    )
