"""JWT authentication for Kairo's single trusted device."""

import time
import uuid
from typing import Literal

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from app.core.config import settings
from app.core.db import get_session
from app.models.user import User

bearer = HTTPBearer(auto_error=False)


def create_token(user_id: uuid.UUID, token_type: Literal["access", "refresh"]) -> str:
    lifetime = (
        settings.access_token_minutes * 60
        if token_type == "access"
        else settings.refresh_token_days * 86_400
    )
    now = int(time.time())
    return jwt.encode(
        {"sub": str(user_id), "type": token_type, "iat": now, "exp": now + lifetime},
        settings.jwt_secret,
        algorithm="HS256",
    )


def decode_token(token: str, expected_type: Literal["access", "refresh"]) -> uuid.UUID:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            options={"require": ["sub", "type", "iat", "exp"]},
        )
        if payload["type"] != expected_type:
            raise ValueError("invalid token type")
        return uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: Session = Depends(get_session),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = decode_token(credentials.credentials, "access")
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Authenticated user no longer exists")
    return user


def get_or_create_device_user(session: Session) -> User:
    user = session.exec(select(User).order_by(User.created_at)).first()
    if user is None:
        user = User()
        session.add(user)
        session.commit()
        session.refresh(user)
    return user
