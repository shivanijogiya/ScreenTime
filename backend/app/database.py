from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

# Convert sync postgresql:// → async postgresql+asyncpg://
def _to_async_database_url(database_url: str) -> str:
    if database_url.startswith("postgresql+asyncpg://"):
        return database_url
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if database_url.startswith("sqlite:///"):
        return database_url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
    return database_url


_db_url = _to_async_database_url(settings.DATABASE_URL)

engine_kwargs = {"echo": settings.DEBUG}
if not _db_url.startswith("sqlite+aiosqlite://"):
    engine_kwargs.update({"pool_size": 10, "max_overflow": 20})
else:
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_async_engine(_db_url, **engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


def import_models() -> None:
    import app.modules.auth_service.models  # noqa: F401
    import app.modules.decision_engine.models  # noqa: F401
    import app.modules.device_registry.models  # noqa: F401
    import app.modules.usage_ingestion.models  # noqa: F401


async def get_db() -> AsyncSession:
    """FastAPI dependency — yields a DB session per request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Create all tables (dev only — use Alembic in prod)."""
    import_models()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# Alias for compatibility with other modules
get_session = get_db
