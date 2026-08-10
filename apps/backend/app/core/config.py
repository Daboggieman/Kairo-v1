"""Centralized configuration.

Every tunable parameter is read from the environment (or a local `.env`) rather than
hardcoded — see `.env.example` for the full list.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Defaults to SQLite so the API and its migrations run with no Docker/Postgres
    # available. Deployments override this with a postgresql+psycopg:// URL.
    database_url: str = "sqlite:///./kairo.db"

    api_v1_prefix: str = "/api/v1"
    debug: bool = False

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


settings = Settings()
