"""Tests for EnterpriseAuditService tamper-evident hash chaining."""

import pytest

from backend.services.enterprise_audit import (
    AuditEventType,
    EnterpriseAuditService,
)
from backend.tests.utils.in_memory_db import InMemoryDatabase

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _cursor_supports_list_sort(monkeypatch):
    """Let the in-memory cursor honor Mongo's list-of-(key, direction) sort API,
    which verify_integrity/search use (``.sort([("timestamp", 1), ("_id", 1)])``)."""
    from backend.tests.utils.in_memory_db import InMemoryCursor

    original = InMemoryCursor.sort

    def sort(self, key, direction=1):
        if isinstance(key, (list, tuple)) and key and isinstance(key[0], (list, tuple)):
            first_key, first_dir = key[0]
            return original(self, first_key, first_dir)
        return original(self, key, direction)

    monkeypatch.setattr(InMemoryCursor, "sort", sort)


def _make(hash_chain: bool = True) -> EnterpriseAuditService:
    return EnterpriseAuditService(InMemoryDatabase(), enable_hash_chain=hash_chain)


async def test_log_returns_id_and_stores_entry():
    svc = _make()
    entry_id = await svc.log(
        AuditEventType.AUTH_LOGIN, "user login", actor_username="alice", actor_ip="10.0.0.1"
    )
    assert entry_id
    docs = svc.collection._documents
    assert len(docs) == 1
    assert docs[0]["action"] == "user login"
    assert docs[0]["actor_username"] == "alice"


async def test_hash_chain_links_consecutive_entries():
    svc = _make(hash_chain=True)
    await svc.log(AuditEventType.AUTH_LOGIN, "first", actor_username="a")
    await svc.log(AuditEventType.AUTH_LOGOUT, "second", actor_username="a")
    docs = svc.collection._documents
    assert docs[0]["entry_hash"]
    assert docs[0]["previous_hash"] is None
    # The second entry chains onto the first.
    assert docs[1]["previous_hash"] == docs[0]["entry_hash"]
    assert docs[1]["entry_hash"] != docs[0]["entry_hash"]


async def test_disabled_hash_chain_stores_no_hash():
    svc = _make(hash_chain=False)
    await svc.log(AuditEventType.AUTH_LOGIN, "login", actor_username="a")
    assert "entry_hash" not in svc.collection._documents[0]


async def test_compute_hash_is_deterministic_and_tamper_sensitive():
    svc = _make()
    entry = {
        "timestamp": "2026-01-01T00:00:00",
        "event_type": "auth.login",
        "actor_id": "u1",
        "action": "login",
        "resource_id": None,
        "details": {"ip": "10.0.0.1"},
    }
    h1 = svc._compute_hash(entry, previous_hash="prev")
    h2 = svc._compute_hash(dict(entry), previous_hash="prev")
    assert h1 == h2  # deterministic
    tampered = {**entry, "action": "logout"}
    assert svc._compute_hash(tampered, previous_hash="prev") != h1  # tamper-sensitive
    # A different previous_hash also changes the result (chain binding).
    assert svc._compute_hash(entry, previous_hash="other") != h1


async def test_verify_integrity_detects_tampering():
    svc = _make(hash_chain=True)
    await svc.log(AuditEventType.AUTH_LOGIN, "first", actor_username="a")
    await svc.log(AuditEventType.DATA_CREATE, "second", actor_username="a")

    clean = await svc.verify_integrity()
    assert clean["status"] == "valid"
    assert clean["valid_entries"] == 2

    # Tamper with a stored entry's action without recomputing its hash.
    svc.collection._documents[0]["action"] = "hacked"
    tampered = await svc.verify_integrity()
    assert tampered["status"] == "tampered"
    assert tampered["invalid_entries"]


async def test_verify_integrity_disabled():
    svc = _make(hash_chain=False)
    result = await svc.verify_integrity()
    assert result["status"] == "disabled"
