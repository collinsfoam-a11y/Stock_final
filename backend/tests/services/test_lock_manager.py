from __future__ import annotations

import asyncio
import fnmatch
from typing import Any, Optional

import pytest

from backend.services.lock_manager import LockManager


class _FakeRedisService:
    def __init__(self) -> None:
        self._kv: dict[str, str] = {}
        self._kv_expiry: dict[str, float] = {}
        self._hashes: dict[str, dict[str, str]] = {}
        self._hash_expiry: dict[str, float] = {}
        self._now = 0.0
        self._set_delay_seconds = 0.0
        self._mutex = asyncio.Lock()
        self.client = self._Client(self)

    class _Client:
        def __init__(self, outer: "_FakeRedisService") -> None:
            self._outer = outer

        async def scan(self, _cursor: int, match: Optional[str] = None, count: int = 100):
            del count
            keys = self._outer._all_keys()
            if match:
                keys = [key for key in keys if fnmatch.fnmatch(key, match)]
            return 0, keys

    def advance(self, seconds: float) -> None:
        self._now += seconds
        self._purge_expired()

    def with_set_delay(self, seconds: float) -> "_FakeRedisService":
        self._set_delay_seconds = max(float(seconds), 0.0)
        return self

    def _all_keys(self) -> list[str]:
        self._purge_expired()
        return sorted(set(self._kv.keys()) | set(self._hashes.keys()))

    def _purge_expired(self) -> None:
        for key, expires_at in list(self._kv_expiry.items()):
            if expires_at <= self._now:
                self._kv.pop(key, None)
                self._kv_expiry.pop(key, None)
        for key, expires_at in list(self._hash_expiry.items()):
            if expires_at <= self._now:
                self._hashes.pop(key, None)
                self._hash_expiry.pop(key, None)

    async def set(
        self,
        key: str,
        value: Any,
        ex: Optional[int] = None,
        px: Optional[int] = None,
        nx: bool = False,
        xx: bool = False,
    ) -> bool:
        del px
        async with self._mutex:
            self._purge_expired()
            exists = key in self._kv or key in self._hashes
            if nx and exists:
                return False
            if xx and not exists:
                return False
            if self._set_delay_seconds > 0:
                await asyncio.sleep(self._set_delay_seconds)
            self._kv[key] = str(value)
            if ex is not None:
                self._kv_expiry[key] = self._now + float(ex)
            else:
                self._kv_expiry.pop(key, None)
            return True

    async def get(self, key: str) -> Optional[str]:
        self._purge_expired()
        return self._kv.get(key)

    async def delete(self, *keys: str) -> int:
        self._purge_expired()
        deleted = 0
        for key in keys:
            removed = False
            if key in self._kv:
                self._kv.pop(key, None)
                self._kv_expiry.pop(key, None)
                removed = True
            if key in self._hashes:
                self._hashes.pop(key, None)
                self._hash_expiry.pop(key, None)
                removed = True
            if removed:
                deleted += 1
        return deleted

    async def exists(self, *keys: str) -> int:
        self._purge_expired()
        return sum(1 for key in keys if key in self._kv or key in self._hashes)

    async def expire(self, key: str, seconds: int) -> bool:
        self._purge_expired()
        if key in self._kv:
            self._kv_expiry[key] = self._now + float(seconds)
            return True
        if key in self._hashes:
            self._hash_expiry[key] = self._now + float(seconds)
            return True
        return False

    async def ttl(self, key: str) -> int:
        self._purge_expired()
        if key in self._kv:
            expires_at = self._kv_expiry.get(key)
        elif key in self._hashes:
            expires_at = self._hash_expiry.get(key)
        else:
            return -2
        if expires_at is None:
            return -1
        return max(int(expires_at - self._now), 0)

    async def eval(self, _script: str, numkeys: int, *keys_and_args: Any) -> int:
        keys = [str(value) for value in keys_and_args[:numkeys]]
        argv = [str(value) for value in keys_and_args[numkeys:]]
        self._purge_expired()

        if numkeys == 1 and len(argv) == 1:
            lock_key = keys[0]
            owner = argv[0]
            if self._kv.get(lock_key) == owner:
                await self.delete(lock_key)
                return 1
            return 0

        if numkeys == 1 and len(argv) == 2:
            lock_key = keys[0]
            owner = argv[0]
            ttl = int(argv[1])
            if self._kv.get(lock_key) == owner:
                self._kv_expiry[lock_key] = self._now + float(ttl)
                return 1
            return 0

        if numkeys == 2 and len(argv) % 2 == 0:
            hash_key = keys[0]
            ttl = int(keys[1])
            if hash_key in self._kv or hash_key in self._hashes:
                return 0
            field_pairs = zip(argv[0::2], argv[1::2], strict=False)
            self._hashes[hash_key] = {field: value for field, value in field_pairs}
            self._hash_expiry[hash_key] = self._now + float(ttl)
            return 1

        return 0

    async def hgetall(self, name: str) -> dict[str, str]:
        self._purge_expired()
        return dict(self._hashes.get(name) or {})


@pytest.mark.asyncio
async def test_rack_lock_simultaneous_access_allows_only_one_owner():
    redis = _FakeRedisService().with_set_delay(0.01)
    manager = LockManager(redis)

    first, second = await asyncio.gather(
        manager.acquire_rack_lock("R-101", "session-a", ttl=30),
        manager.acquire_rack_lock("R-101", "session-b", ttl=30),
    )

    assert sorted([first, second]) == [False, True]
    owner = await manager.get_rack_lock_owner("R-101")
    assert owner in {"session-a", "session-b"}


@pytest.mark.asyncio
async def test_rack_lock_expiry_allows_reacquire_after_ttl():
    redis = _FakeRedisService()
    manager = LockManager(redis)

    acquired = await manager.acquire_rack_lock("R-201", "session-a", ttl=5)
    assert acquired is True
    assert await manager.get_rack_lock_owner("R-201") == "session-a"

    redis.advance(6)
    assert await manager.is_rack_locked("R-201") is False

    reacquired = await manager.acquire_rack_lock("R-201", "session-b", ttl=5)
    assert reacquired is True
    assert await manager.get_rack_lock_owner("R-201") == "session-b"


@pytest.mark.asyncio
async def test_rack_lock_release_and_renew_require_ownership():
    redis = _FakeRedisService()
    manager = LockManager(redis)

    assert await manager.acquire_rack_lock("R-301", "session-owner", ttl=5) is True
    assert await manager.release_rack_lock("R-301", "session-other") is False
    assert await manager.renew_rack_lock("R-301", "session-other", ttl=5) is False
    assert await manager.renew_rack_lock("R-301", "session-owner", ttl=30) is True
    assert await manager.release_rack_lock("R-301", "session-owner") is True
    assert await manager.is_rack_locked("R-301") is False
