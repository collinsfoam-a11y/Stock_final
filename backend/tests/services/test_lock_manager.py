import pytest

from backend.services.lock_manager import LockManager


class RedisWithoutEval:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.expirations: dict[str, int] = {}

    async def get(self, key: str) -> str | None:
        return self.values.get(key)

    async def set(
        self,
        key: str,
        value: str,
        ex: int | None = None,
        px: int | None = None,
        nx: bool = False,
        xx: bool = False,
    ) -> bool:
        del px, xx
        if nx and key in self.values:
            return False
        self.values[key] = value
        if ex is not None:
            self.expirations[key] = ex
        return True

    async def delete(self, *keys: str) -> int:
        deleted = 0
        for key in keys:
            if key in self.values:
                deleted += 1
                self.values.pop(key, None)
                self.expirations.pop(key, None)
        return deleted

    async def expire(self, key: str, seconds: int) -> bool:
        if key not in self.values:
            return False
        self.expirations[key] = seconds
        return True


@pytest.mark.asyncio
async def test_rack_lock_release_falls_back_without_redis_eval():
    redis = RedisWithoutEval()
    manager = LockManager(redis)  # type: ignore[arg-type]

    assert await manager.acquire_rack_lock("A1", "staff1", ttl=60) is True
    assert await manager.release_rack_lock("A1", "staff1") is True
    assert await redis.get("rack:lock:A1") is None


@pytest.mark.asyncio
async def test_rack_lock_renew_falls_back_without_redis_eval():
    redis = RedisWithoutEval()
    manager = LockManager(redis)  # type: ignore[arg-type]

    assert await manager.acquire_rack_lock("A1", "staff1", ttl=60) is True
    assert await manager.renew_rack_lock("A1", "staff1", ttl=120) is True
    assert redis.expirations["rack:lock:A1"] == 120
