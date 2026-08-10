"""Database engine and session dependency."""

from collections.abc import Generator

from sqlmodel import Session, create_engine

from app.core.config import settings

# check_same_thread is a SQLite-only concern: FastAPI serves requests from a
# threadpool, and SQLite otherwise refuses connections reused across threads.
connect_args = {"check_same_thread": False} if settings.is_sqlite else {}

engine = create_engine(settings.database_url, echo=settings.debug, connect_args=connect_args)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
