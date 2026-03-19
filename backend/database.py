from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

engine_kwargs = {"pool_pre_ping": True}

if settings.database_url.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(settings.database_url, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, expire_on_commit=False, bind=engine)
Base = declarative_base()


def ensure_schema_compatibility() -> None:
    inspector = inspect(engine)
    if "neuroai_users" not in inspector.get_table_names():
        return

    user_columns = {column["name"] for column in inspector.get_columns("neuroai_users")}
    if "has_seen_onboarding" in user_columns:
        return

    ddl = "ALTER TABLE neuroai_users ADD COLUMN has_seen_onboarding BOOLEAN NOT NULL DEFAULT 0"
    if engine.dialect.name != "sqlite":
        ddl = "ALTER TABLE neuroai_users ADD COLUMN has_seen_onboarding BOOLEAN NOT NULL DEFAULT FALSE"

    # `create_all()` does not add new columns to existing tables, so older dev DBs need
    # a lightweight compatibility patch before the app starts serving requests.
    try:
        with engine.begin() as connection:
            connection.execute(text(ddl))
    except OperationalError as exc:
        message = str(exc).lower()
        if "duplicate column name" not in message and "already exists" not in message:
            raise


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
