"""Behavioral tests for EnterpriseSecurityService IP filtering.

Focuses on the security decision surface (allow/deny) and the cache the
service maintains. Uses the in-memory DB for the collection writes; the
lockout path relies on Mongo operators the in-memory harness does not
implement and is covered separately where feasible.
"""

import pytest
from backend.services.enterprise_security import (
    EnterpriseSecurityService,
    IPListType,
    SecurityAction,
)
from backend.tests.utils.in_memory_db import InMemoryDatabase

pytestmark = pytest.mark.asyncio


def _make() -> EnterpriseSecurityService:
    svc = EnterpriseSecurityService(InMemoryDatabase(), max_login_attempts=3)
    svc._cache_loaded = True  # skip index-dependent initialize()
    return svc


async def test_ip_filtering_disabled_always_allows():
    svc = _make()
    svc.enable_ip_filtering = False
    assert await svc.check_ip("203.0.113.5") is SecurityAction.ALLOW


async def test_blacklisted_ip_is_denied():
    svc = _make()
    await svc.add_to_ip_list("203.0.113.5", IPListType.BLACKLIST, reason="abuse")
    assert await svc.check_ip("203.0.113.5") is SecurityAction.DENY
    # A different IP is still allowed (no whitelist configured).
    assert await svc.check_ip("203.0.113.9") is SecurityAction.ALLOW


async def test_whitelist_denies_non_listed_ips():
    svc = _make()
    await svc.add_to_ip_list("10.0.0.1", IPListType.WHITELIST)
    assert await svc.check_ip("10.0.0.1") is SecurityAction.ALLOW
    # Whitelist is non-empty -> anything not on it is denied.
    assert await svc.check_ip("10.0.0.2") is SecurityAction.DENY


async def test_blacklist_takes_priority_over_whitelist():
    svc = _make()
    await svc.add_to_ip_list("10.0.0.1", IPListType.WHITELIST)
    await svc.add_to_ip_list("10.0.0.1", IPListType.BLACKLIST)
    # Blacklist is checked first for security.
    assert await svc.check_ip("10.0.0.1") is SecurityAction.DENY


async def test_add_updates_cache_immediately():
    svc = _make()
    assert "1.2.3.4" not in svc._blacklist_cache
    await svc.add_to_ip_list("1.2.3.4", IPListType.BLACKLIST)
    assert "1.2.3.4" in svc._blacklist_cache


async def test_get_ip_lists_returns_both_lists():
    svc = _make()
    await svc.add_to_ip_list("10.0.0.1", IPListType.WHITELIST, reason="office")
    await svc.add_to_ip_list("203.0.113.5", IPListType.BLACKLIST, reason="abuse")
    lists = await svc.get_ip_lists()
    wl = {e["ip_address"] for e in lists["whitelist"]}
    bl = {e["ip_address"] for e in lists["blacklist"]}
    assert "10.0.0.1" in wl
    assert "203.0.113.5" in bl
