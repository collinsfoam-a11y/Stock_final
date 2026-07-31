import time
from typing import Optional

from fastapi import Request

from backend.services.runtime import get_cache_service


def get_rate_limit_key(request: Request, identifier: Optional[str] = None) -> str:
    """
    Generate a composite rate limit key for authentication attempts.
    """
    client_ip = request.client.host if request.client else "unknown"
    # Fallback to X-Forwarded-For if available and trusted proxy is used
    if client_ip in {"127.0.0.1", "::1", "172.17.0.1", "10.0.0.1"}:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()

    user_part = identifier or "global"
    return f"{client_ip}:{user_part}"


class AuthRateLimiter:
    """
    Rate limiter specifically for authentication endpoints.
    Records failed attempts in the cache and tracks rate limits by IP and by identifier.
    """

    async def is_allowed(self, key: str, max_attempts: int, window: int) -> bool:
        cache_service = get_cache_service()
        if not cache_service:
            return True

        now = time.time()
        attempts = await cache_service.get("auth_rate_limit", key) or []

        if not isinstance(attempts, list):
            attempts = []

        # Clean up old attempts
        valid_attempts = [t for t in attempts if now - t < window]

        return len(valid_attempts) < max_attempts

    async def record(self, key: str, window: int) -> None:
        cache_service = get_cache_service()
        if not cache_service:
            return

        now = time.time()
        attempts = await cache_service.get("auth_rate_limit", key) or []

        if not isinstance(attempts, list):
            attempts = []

        # Clean up old attempts and add new one
        valid_attempts = [t for t in attempts if now - t < window]
        valid_attempts.append(now)

        await cache_service.set("auth_rate_limit", key, valid_attempts, ttl=window)

    async def reset(self, key: str) -> None:
        cache_service = get_cache_service()
        if not cache_service:
            return
        await cache_service.delete("auth_rate_limit", key)


auth_rate_limiter = AuthRateLimiter()

from fastapi import HTTPException, status
from backend.config import settings

async def check_auth_rate_limits(request: Request, identifier: Optional[str] = None) -> None:
    if not getattr(settings, "RATE_LIMIT_ENABLED", True):
        return

    ip_key = get_rate_limit_key(request)
    user_key = get_rate_limit_key(request, identifier) if identifier else None

    ip_max = getattr(settings, "RATE_LIMIT_AUTH_IP_MAX_ATTEMPTS", 20)
    ip_window = getattr(settings, "RATE_LIMIT_AUTH_IP_WINDOW_SECONDS", 300)

    user_max = getattr(settings, "RATE_LIMIT_AUTH_MAX_ATTEMPTS", 5)
    user_window = getattr(settings, "RATE_LIMIT_AUTH_WINDOW_SECONDS", 900)

    if not await auth_rate_limiter.is_allowed(ip_key, ip_max, ip_window):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many authentication attempts from this IP. Please try again later.",
            headers={"Retry-After": str(ip_window)},
        )

    if user_key and not await auth_rate_limiter.is_allowed(user_key, user_max, user_window):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts for this account. Please try again later.",
            headers={"Retry-After": str(user_window)},
        )

async def record_auth_failure(request: Request, identifier: Optional[str] = None) -> None:
    if not getattr(settings, "RATE_LIMIT_ENABLED", True):
        return

    ip_key = get_rate_limit_key(request)
    user_key = get_rate_limit_key(request, identifier) if identifier else None

    ip_window = getattr(settings, "RATE_LIMIT_AUTH_IP_WINDOW_SECONDS", 300)
    user_window = getattr(settings, "RATE_LIMIT_AUTH_WINDOW_SECONDS", 900)

    await auth_rate_limiter.record(ip_key, ip_window)
    if user_key:
        await auth_rate_limiter.record(user_key, user_window)

async def reset_auth_limits(request: Request, identifier: Optional[str] = None) -> None:
    ip_key = get_rate_limit_key(request)
    user_key = get_rate_limit_key(request, identifier) if identifier else None

    await auth_rate_limiter.reset(ip_key)
    if user_key:
        await auth_rate_limiter.reset(user_key)

