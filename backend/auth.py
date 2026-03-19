from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.hash import pbkdf2_sha256
from sqlalchemy.orm import Session

try:
    from config import settings
    from database import get_db
    from errors import api_error
    from models import User
except ImportError:  # pragma: no cover - package import fallback
    from .config import settings
    from .database import get_db
    from .errors import api_error
    from .models import User

ALGORITHM = "HS256"

oauth2_scheme = HTTPBearer()


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
    credentials: HTTPAuthorizationCredentials = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "AUTH_ERROR", "message": "Could not validate credentials"},
        headers={"WWW-Authenticate": "Bearer"},
    )

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
