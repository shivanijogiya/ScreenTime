import redis.asyncio as aioredis
from typing import Any
from app.config import settings


class NullRedis:
    async def ping(self) -> bool:
        return False

    async def get(self, key: str) -> Any:
        return None

    async def set(self, key: str, value: Any, ex: int | None = None):
        return None

    async def setex(self, key: str, ttl: int, value: Any):
        return None

    async def delete(self, *keys: str):
        return 0

    async def aclose(self):
        return None

class RedisClient:
    def __init__(self):
        self._redis_text: aioredis.Redis | NullRedis | None = None
        self._redis_bytes: aioredis.Redis | NullRedis | None = None

    async def initialize(self):
        if not settings.REDIS_ENABLED:
            self._redis_text = NullRedis()
            self._redis_bytes = NullRedis()
            return
        self._redis_text = aioredis.from_url(
            settings.REDIS_URL, decode_responses=True
        )
        self._redis_bytes = aioredis.from_url(
            settings.REDIS_URL, decode_responses=False
        )

    async def close(self):
        if self._redis_text:
            await self._redis_text.aclose()
            self._redis_text = None
        if self._redis_bytes:
            await self._redis_bytes.aclose()
            self._redis_bytes = None

    async def ping(self) -> bool:
        if not self._redis_text:
            return False
        try:
            return await self._redis_text.ping()
        except:
            return False

    async def get(self, key: str) -> Any:
        if not self._redis_text:
            return None
        try:
            return await self._redis_text.get(key)
        except Exception:
            return None

    async def set(self, key: str, value: Any, ttl: int = None):
        if not self._redis_text:
            return
        try:
            if ttl:
                await self._redis_text.set(key, value, ex=ttl)
            else:
                await self._redis_text.set(key, value)
        except Exception:
            return

    async def get_raw(self, key: str) -> bytes | None:
        if not self._redis_bytes:
            return None
        try:
            return await self._redis_bytes.get(key)
        except Exception:
            return None

    async def set_raw(self, key: str, value: bytes, ttl: int = None):
        if not self._redis_bytes:
            return
        try:
            if ttl:
                await self._redis_bytes.set(key, value, ex=ttl)
            else:
                await self._redis_bytes.set(key, value)
        except Exception:
            return

redis_client = RedisClient()

async def get_redis() -> aioredis.Redis | NullRedis:
    if not redis_client._redis_text:
        await redis_client.initialize()
    return redis_client._redis_text or NullRedis()

async def close_redis():
    await redis_client.close()
