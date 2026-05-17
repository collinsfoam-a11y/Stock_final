from datetime import datetime, timezone


def utc_now() -> datetime:
    """
    Return the current UTC datetime as a timezone-aware object.
    Recommended for all new implementations.
    """
    return datetime.now(timezone.utc)


def utc_now_naive() -> datetime:
    """
    Return the current UTC datetime as a naive object (no tzinfo).
    Direct drop-in replacement for the deprecated datetime.utcnow().
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def utc_now_iso() -> str:
    """
    Return the current UTC datetime as an ISO 8601 string.
    """
    return utc_now_naive().isoformat()
