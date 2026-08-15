"""Exchange the configured device credential for short-lived bearer tokens."""

import hmac

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.core.auth import create_token, decode_token, get_or_create_device_user
from app.core.config import settings
from app.core.db import get_session
from app.models.user import User
from app.schemas.auth import DeviceTokenRequest, RefreshTokenRequest, TokenPair

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_pair(user: User) -> TokenPair:
    return TokenPair(
        access_token=create_token(user.id, "access"),
        refresh_token=create_token(user.id, "refresh"),
    )


@router.post("/token", response_model=TokenPair)
def exchange_device_key(
    payload: DeviceTokenRequest, session: Session = Depends(get_session)
) -> TokenPair:
    if not hmac.compare_digest(payload.device_key, settings.device_key):
        raise HTTPException(status_code=401, detail="Invalid device credential")
    return _token_pair(get_or_create_device_user(session))


@router.post("/refresh", response_model=TokenPair)
def refresh_tokens(
    payload: RefreshTokenRequest, session: Session = Depends(get_session)
) -> TokenPair:
    user_id = decode_token(payload.refresh_token, "refresh")
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Authenticated user no longer exists")
    return _token_pair(user)
