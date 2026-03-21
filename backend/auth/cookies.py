"""Cookie helpers for browser-based authentication flows."""

from __future__ import annotations

from typing import Literal, Optional, TypedDict, cast

from fastapi import Request, Response

from backend.config import settings


class _CookieKwargs(TypedDict, total=False):
    httponly: bool
    max_age: int
    expires: int
    path: str
    secure: bool
    samesite: Literal["lax", "strict", "none"]
    domain: str


def _cookie_domain() -> Optional[str]:
    domain = getattr(settings, "AUTH_COOKIE_DOMAIN", None)
    return domain or None


def _cookie_secure() -> bool:
    env = getattr(settings, "ENVIRONMENT", "development").lower()
    return bool(getattr(settings, "FORCE_HTTPS", False) or env in {"production", "staging"})


def _cookie_samesite() -> Literal["lax", "strict", "none"]:
    configured = str(getattr(settings, "AUTH_COOKIE_SAMESITE", "lax")).lower()
    if configured == "none" and not _cookie_secure():
        # Browsers reject SameSite=None cookies without Secure.
        return "lax"
    if configured in {"lax", "strict", "none"}:
        return cast(Literal["lax", "strict", "none"], configured)
    return "lax"


def _cookie_kwargs(max_age_seconds: int) -> _CookieKwargs:
    cookie_kwargs: _CookieKwargs = {
        "httponly": True,
        "max_age": max_age_seconds,
        "expires": max_age_seconds,
        "path": "/",
        "secure": _cookie_secure(),
        "samesite": _cookie_samesite(),
    }
    domain = _cookie_domain()
    if domain:
        cookie_kwargs["domain"] = domain
    return cookie_kwargs


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    access_max_age = int(getattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 15) * 60)
    refresh_max_age = int(getattr(settings, "REFRESH_TOKEN_EXPIRE_DAYS", 30) * 24 * 60 * 60)
    response.set_cookie(
        getattr(settings, "AUTH_ACCESS_COOKIE_NAME", "sv_access_token"),
        access_token,
        **_cookie_kwargs(access_max_age),
    )
    response.set_cookie(
        getattr(settings, "AUTH_REFRESH_COOKIE_NAME", "sv_refresh_token"),
        refresh_token,
        **_cookie_kwargs(refresh_max_age),
    )


def clear_auth_cookies(response: Response) -> None:
    domain = _cookie_domain()
    response.delete_cookie(
        getattr(settings, "AUTH_ACCESS_COOKIE_NAME", "sv_access_token"),
        path="/",
        domain=domain,
    )
    response.delete_cookie(
        getattr(settings, "AUTH_REFRESH_COOKIE_NAME", "sv_refresh_token"),
        path="/",
        domain=domain,
    )


def _normalize_cookie_token(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip()
    if len(normalized) >= 2 and normalized[0] == normalized[-1] == '"':
        normalized = normalized[1:-1]
    return normalized or None


def get_access_token_cookie(request: Request) -> Optional[str]:
    return _normalize_cookie_token(
        request.cookies.get(getattr(settings, "AUTH_ACCESS_COOKIE_NAME", "sv_access_token"))
    )


def get_refresh_token_cookie(request: Request) -> Optional[str]:
    return _normalize_cookie_token(
        request.cookies.get(getattr(settings, "AUTH_REFRESH_COOKIE_NAME", "sv_refresh_token"))
    )
