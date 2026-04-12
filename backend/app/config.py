import os
import tempfile
from functools import lru_cache

from pydantic_settings import BaseSettings

DEFAULT_SQLITE_PATH = os.path.join(tempfile.gettempdir(), "screensync.db").replace("\\", "/")


class Settings(BaseSettings):
    # App
    APP_NAME: str = "ScreenSync"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"
    ALLOWED_ORIGINS: list[str] = ["*"]

    # Database
    DATABASE_URL: str = f"sqlite:///{DEFAULT_SQLITE_PATH}"

    # Redis
    REDIS_URL: str = "redis://:screensync@redis:6379"
    REDIS_ENABLED: bool = True

    # MQTT
    MQTT_BROKER_HOST: str = "mosquitto"
    MQTT_BROKER_PORT: int = 1883
    MQTT_USERNAME: str = "screensync"
    MQTT_PASSWORD: str = "secret"
    MQTT_CLIENT_ID: str = "screensync-backend"
    MQTT_ENABLED: bool = True

    # Auth / JWT
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day

    # Federated Learning
    FL_MIN_DEVICES_PER_ROUND: int = 2
    FL_ROUND_INTERVAL_SECONDS: int = 3600

    # Decision Engine
    HEARTBEAT_TIMEOUT_SECONDS: int = 60
    DEFAULT_DAILY_BUDGET_SECONDS: int = 14400  # 4 hours

    class Config:
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
