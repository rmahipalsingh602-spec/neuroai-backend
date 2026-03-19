from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..auth import authenticate_user, create_access_token, get_current_user, get_password_hash
from ..database import get_db
from ..errors import api_error
from ..models import User
from ..schemas import AuthRequest, AuthResponse, UserSummary
from ..services.usage import build_user_summary, refresh_usage_if_needed

router = APIRouter()


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

    access_token = create_access_token(str(user.id))
    return AuthResponse(
        access_token=access_token,
        token_type="bearer",
        user=build_user_summary(user, document_count=0, payment_count=0, has_seen_onboarding=user.has_seen_onboarding),
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: AuthRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, payload.email, payload.password)
    if user is None:
        api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_ERROR", "Incorrect email or password")

    refresh_usage_if_needed(db, user)
    access_token = create_access_token(str(user.id))
    return AuthResponse(
        access_token=access_token,
        token_type="bearer",
        user=build_user_summary(user, len(user.documents), len(user.payments), has_seen_onboarding=user.has_seen_onboarding),
    )


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

