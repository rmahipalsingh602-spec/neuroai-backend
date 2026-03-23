import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.hash import pbkdf2_sha256
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import get_db
from backend.errors import api_error
from backend.models import RefreshToken, User

ALGORITHM = "HS256"

oauth2_scheme = HTTPBearer(auto_error=False)


def verify_password(plain_password: str, password_hash: str) -> tuple[bool, bool]:
    if not password_hash:
        return False, False

    if password_hash.startswith("$pbkdf2-sha256$"):
        try:
            return pbkdf2_sha256.verify(plain_password, password_hash), True
        except ValueError:
            return False, False

    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8")), False
    except (TypeError, ValueError):
        return False, False


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_access_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    return jwt.encode({"sub": subject, "exp": expire}, settings.secret_key, algorithm=ALGORITHM)


def create_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_refresh_token(db: Session, user: User) -> str:
    expires_at = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    raw_token = create_refresh_token()

    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw_token),
            expires_at=expires_at,
        )
    )
    db.commit()
    prune_refresh_tokens(db, user.id)
    return raw_token


def refresh_user_session(db: Session, raw_refresh_token: str) -> tuple[User, str]:
    refresh_row = (
        db.query(RefreshToken)
        .filter(RefreshToken.token_hash == hash_refresh_token(raw_refresh_token))
        .first()
    )

    if refresh_row is None or refresh_row.revoked_at is not None:
        api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_ERROR", "Your session expired. Please login again.")

    if refresh_row.expires_at <= datetime.utcnow():
        refresh_row.revoked_at = datetime.utcnow()
        db.add(refresh_row)
        db.commit()
        api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_ERROR", "Your session expired. Please login again.")

    refresh_row.revoked_at = datetime.utcnow()
    db.add(refresh_row)
    db.flush()

    next_refresh_token = create_refresh_token()
    db.add(
        RefreshToken(
            user_id=refresh_row.user_id,
            token_hash=hash_refresh_token(next_refresh_token),
            expires_at=datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    db.commit()

    user = db.query(User).filter(User.id == refresh_row.user_id).first()
    if user is None:
        api_error(status.HTTP_401_UNAUTHORIZED, "AUTH_ERROR", "Your session expired. Please login again.")

    prune_refresh_tokens(db, user.id)
    return user, next_refresh_token


def revoke_refresh_token(db: Session, raw_refresh_token: str) -> None:
    refresh_row = (
        db.query(RefreshToken)
        .filter(RefreshToken.token_hash == hash_refresh_token(raw_refresh_token))
        .first()
    )
    if refresh_row is None or refresh_row.revoked_at is not None:
        return

    refresh_row.revoked_at = datetime.utcnow()
    db.add(refresh_row)
    db.commit()


def prune_refresh_tokens(db: Session, user_id: int, keep_latest: int = 5) -> None:
    active_tokens = (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user_id)
        .order_by(RefreshToken.created_at.desc())
        .all()
    )

    now = datetime.utcnow()
    mutated = False
    for stale_token in active_tokens[keep_latest:]:
        if stale_token.revoked_at is None:
            stale_token.revoked_at = now
            db.add(stale_token)
            mutated = True

    for refresh_row in active_tokens:
        if refresh_row.expires_at <= now and refresh_row.revoked_at is None:
            refresh_row.revoked_at = now
            db.add(refresh_row)
            mutated = True

    if mutated:
        db.commit()


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    user = db.query(User).filter(User.email == email.lower()).first()
    if not user:
        return None

    is_valid, needs_rehash = verify_password(password, user.password_hash)
    if not is_valid:
        return None

    if needs_rehash:
        user.password_hash = get_password_hash(password)
        db.add(user)
        db.commit()
        db.refresh(user)

    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "AUTH_ERROR", "message": "Could not validate credentials"},
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise credentials_exception

    try:
        payload = jwt.decode(credentials.credentials, settings.secret_key, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.email.lower() not in settings.admin_emails:
        api_error(status.HTTP_403_FORBIDDEN, "ADMIN_REQUIRED", "Admin access required")
    return current_user
