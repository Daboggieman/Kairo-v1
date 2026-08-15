"""Request and response shapes for device authentication."""

from sqlmodel import SQLModel


class DeviceTokenRequest(SQLModel):
    device_key: str


class RefreshTokenRequest(SQLModel):
    refresh_token: str


class TokenPair(SQLModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
