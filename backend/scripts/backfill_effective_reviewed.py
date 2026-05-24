"""
One-time backfill: populate ``effective_reviewed`` on count_lines documents
that predate the H-02 fix.

Run with:
    python -m backend.scripts.backfill_effective_reviewed

Or via the admin CLI if wired:
    make backfill-effective-reviewed

The script is idempotent — it skips documents that already have the field.
It processes in batches of 500 to avoid memory pressure and yields control
between batches so the event loop stays responsive if run in an async context.
"""

import asyncio
import logging
import os
import sys

logger = logging.getLogger(__name__)


async def backfill(db, batch_size: int = 500) -> int:
    """Backfill ``effective_reviewed`` on all count_lines missing the field.

    Returns the number of documents updated.
    """
    # Import here so the script can be run standalone without the full app
    # import chain being needed at module level.
    from backend.services.canonical_inventory import is_count_line_effectively_reviewed

    updated = 0
    skipped = 0

    query = {"effective_reviewed": {"$exists": False}}
    total = await db.count_lines.count_documents(query)
    logger.info("Found %d count_lines missing effective_reviewed field", total)

    if total == 0:
        logger.info("Nothing to backfill.")
        return 0

    cursor = db.count_lines.find(query, {"_id": 1, "verified": 1, "approval_status": 1,
                                          "status": 1, "assigned_to": 1,
                                          "recount_requested_at": 1, "variance": 1})

    batch = []
    async for doc in cursor:
        val = is_count_line_effectively_reviewed(doc)
        batch.append({"_id": doc["_id"], "effective_reviewed": val})

        if len(batch) >= batch_size:
            ops = [
                {
                    "update_one": {
                        "filter": {"_id": item["_id"]},
                        "update": {"$set": {"effective_reviewed": item["effective_reviewed"]}},
                    }
                }
                for item in batch
            ]
            result = await db.count_lines.bulk_write(ops, ordered=False)
            updated += result.modified_count
            logger.info("Backfilled %d / %d documents...", updated, total)
            batch = []
            # Yield control briefly between batches
            await asyncio.sleep(0)

    # Flush remaining
    if batch:
        ops = [
            {
                "update_one": {
                    "filter": {"_id": item["_id"]},
                    "update": {"$set": {"effective_reviewed": item["effective_reviewed"]}},
                }
            }
            for item in batch
        ]
        result = await db.count_lines.bulk_write(ops, ordered=False)
        updated += result.modified_count

    logger.info("Backfill complete: %d documents updated, %d already had the field", updated, skipped)
    return updated


async def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    # Allow running from repo root: python -m backend.scripts.backfill_effective_reviewed
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

    from backend.db.runtime import get_db
    from backend.config import settings

    # Ensure DB is connected
    try:
        from backend.db.runtime import init_db
        await init_db(settings.MONGODB_URL, settings.MONGODB_DB_NAME)
    except Exception:
        pass  # Already initialised if running inside app context

    db = get_db()
    await backfill(db)


if __name__ == "__main__":
    asyncio.run(main())
