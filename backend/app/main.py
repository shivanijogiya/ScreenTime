# app/main.py
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine, import_models
from app.shared.mqtt_client import get_mqtt_client
from app.shared.redis_client import redis_client

from app.modules.device_registry.router import router as device_router
from app.modules.usage_ingestion.mqtt_listener import start_mqtt_listener
from app.modules.auth_service.oauth import router as auth_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────
    # 1. Create DB tables (Alembic handles migrations; this is a safety net)
    import_models()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 2. Connect to Redis
    try:
        await redis_client.initialize()
    except Exception as exc:
        logger.warning("Redis initialization failed; continuing without Redis: %s", exc)

    # 3. Connect MQTT broker + start background listener
    client = None
    try:
        client = get_mqtt_client()
    except Exception as exc:
        logger.warning("MQTT initialization failed; continuing without MQTT: %s", exc)

    # Note: get_mqtt_client() automatically initializes the connection
    # to the broker using the settings inside the function.
    start_mqtt_listener()

    yield

    # ── Shutdown ─────────────────────────────────────────────
    if client is not None:
        client.disconnect()
    await redis_client.close()


app = FastAPI(
    title="ScreenSync API",
    description=(
        "Production-grade cross-device screen-time management system. "
        "REST control plane + MQTT data plane."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,   # restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
API_PREFIX = "/api/v1"

app.include_router(auth_router,   prefix=f"{API_PREFIX}/auth",    tags=["Auth"])
app.include_router(device_router, prefix=f"{API_PREFIX}/devices", tags=["Device Registry"])

# Remaining routers — wire in as each module is implemented
# from app.modules.usage_ingestion.router  import router as usage_router
# from app.modules.decision_engine.router  import router as budget_router
# from app.modules.override_service.router import router as override_router
# from app.modules.fl_worker.router        import router as fl_router
#
# app.include_router(usage_router,    prefix=f"{API_PREFIX}/usage",    tags=["Usage"])
# app.include_router(budget_router,   prefix=f"{API_PREFIX}/budget",   tags=["Budget"])
# app.include_router(override_router, prefix=f"{API_PREFIX}/override", tags=["Override"])
# app.include_router(fl_router,       prefix=f"{API_PREFIX}/fl",       tags=["Federated Learning"])


# ── Health & Root ─────────────────────────────────────────────────────────────
@app.get("/", tags=["Root"])
async def root():
    return {"service": "ScreenSync", "status": "running", "version": "1.0.0"}


@app.get("/health", tags=["Health"])
async def health():
    """Lightweight liveness probe for Nginx / load balancer."""
    redis_ok = await redis_client.ping()
    try:
        client = get_mqtt_client()
        mqtt_ok = client.is_connected()
    except Exception:
        mqtt_ok = False
    return {
        "status": "ok" if (redis_ok and mqtt_ok) else "degraded",
        "redis": "up" if redis_ok else "down",
        "mqtt":  "up" if mqtt_ok  else "down",
    }
