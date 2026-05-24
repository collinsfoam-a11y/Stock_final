from __future__ import annotations

import os

import pytest


def _require_external_chaos_approval() -> None:
    if os.getenv("RUN_EXTERNAL_CHAOS", "").lower() != "true":
        pytest.skip("External chaos harness disabled: set RUN_EXTERNAL_CHAOS=true")
    if os.getenv("RUN_EXTERNAL_CHAOS_APPROVED", "").lower() != "true":
        pytest.skip(
            "External chaos harness requires explicit approval via "
            "RUN_EXTERNAL_CHAOS_APPROVED=true"
        )


@pytest.mark.external_chaos
@pytest.mark.asyncio
async def test_es_01_real_mongo_replica_set_failover_harness_is_approval_gated():
    _require_external_chaos_approval()
    mongo_uri = os.getenv("CHAOS_MONGO_URI")
    mongo_db_name = os.getenv("CHAOS_MONGO_DB", "")
    if not mongo_uri or "chaos" not in mongo_db_name.lower():
        pytest.skip("CHAOS_MONGO_URI and a chaos-scoped CHAOS_MONGO_DB are required")

    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(mongo_uri, serverSelectionTimeoutMS=3000)
    db = client[mongo_db_name]
    await client.admin.command("ping")

    async with await client.start_session() as session:
        async with session.start_transaction():
            await db.replay_external_chaos_probe.insert_one(
                {"_id": "transaction-probe", "status": "committed"},
                session=session,
            )

    stored = await db.replay_external_chaos_probe.find_one({"_id": "transaction-probe"})
    await db.replay_external_chaos_probe.delete_one({"_id": "transaction-probe"})
    client.close()

    assert stored["status"] == "committed"


@pytest.mark.external_chaos
@pytest.mark.asyncio
async def test_es_02_redis_cluster_outage_harness_is_approval_gated():
    _require_external_chaos_approval()
    redis_url = os.getenv("CHAOS_REDIS_URL")
    if not redis_url:
        pytest.skip("CHAOS_REDIS_URL is required")

    import redis.asyncio as redis

    client = redis.from_url(redis_url)
    pong = await client.ping()
    await client.aclose()

    assert pong is True
