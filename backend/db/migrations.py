"""
Database Migrations - MongoDB schema migrations
Handles database schema updates and indexing
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.db.indexes import create_indexes as create_optimized_indexes

logger = logging.getLogger(__name__)


class MigrationManager:
    """Manages database schema migrations"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.migrations_collection = "migrations"

    # backend/db/indexes.py is the single source of truth for indexes.
    # migrations.py only handles: (1) data cleanups that must precede unique
    # indexes, (2) dropping obsolete indexes from older schema versions, and
    # (3) converging the live DB to the authoritative catalog by removing
    # legacy duplicate indexes left behind by previous index systems.

    async def ensure_indexes(self):
        """Apply the authoritative index catalog and clean up legacy duplicates."""
        logger.info("Creating database indexes...")

        try:
            # 0. Pre-clean data that would block unique indexes.
            await self._cleanup_duplicate_usernames()

            # 1. Drop obsolete indexes from prior schema versions (serial uniqueness).
            await self._drop_obsolete_serial_indexes()

            # 2. Drop catalog-named indexes whose key/options drifted, so the
            #    catalog can recreate them (create skips on IndexOptionsConflict).
            await self._drop_mismatched_catalog_indexes()

            # 3. Apply the single source of truth (backend/db/indexes.py).
            logger.info("Applying authoritative index definitions...")
            await create_optimized_indexes(self.db)

            # 4. Remove legacy duplicate indexes superseded by the catalog.
            await self._drop_legacy_duplicate_indexes()

            logger.info("All database indexes created successfully")
        except Exception as e:
            logger.error(f"Error creating indexes: {str(e)}")
            raise

    # ── Authoritative collections owned entirely by backend/db/indexes.py ──────
    # Any index on these collections that is not in the catalog (and not _id_)
    # is a legacy duplicate and will be dropped to converge the live DB.
    _CATALOG_OWNED_COLLECTIONS = (
        "count_lines",
        "sessions",
        "erp_items",
        "refresh_tokens",
        "item_variances",
        "products",
        "activity_logs",
        "users",
    )

    async def _authoritative_index_names(self, collection_name: str) -> set[str]:
        """Index names defined for a collection in the authoritative catalog."""
        from backend.db.indexes import INDEXES

        names: set[str] = {"_id_"}
        for _spec, options in INDEXES.get(collection_name, []):
            name = options.get("name")
            if name:
                names.add(str(name))
        return names

    @staticmethod
    def _index_spec_matches(existing: dict, key_spec: Any, options: dict) -> bool:
        """True when a live index already matches the catalog key + key options."""
        want_key = [(field, direction) for field, direction in key_spec]
        have_key = [(field, direction) for field, direction in (existing.get("key") or {}).items()]
        if want_key != have_key:
            return False
        # Compare the options that change index semantics.
        for opt in ("unique", "sparse"):
            if bool(existing.get(opt, False)) != bool(options.get(opt, False)):
                return False
        if "expireAfterSeconds" in options or "expireAfterSeconds" in existing:
            if existing.get("expireAfterSeconds") != options.get("expireAfterSeconds"):
                return False
        return True

    async def _drop_mismatched_catalog_indexes(self) -> None:
        """Drop catalog-named indexes whose key/options no longer match the catalog.

        ``create_indexes`` silently skips on IndexOptionsConflict, so without this
        a same-named index created under an older definition would never converge.
        """
        from backend.db.indexes import INDEXES

        for collection_name in self._CATALOG_OWNED_COLLECTIONS:
            specs = {
                str(options["name"]): (key_spec, options)
                for key_spec, options in INDEXES.get(collection_name, [])
                if options.get("name")
            }
            if not specs:
                continue
            try:
                collection = self.db[collection_name]
                existing = await collection.list_indexes().to_list(length=200)
                for index in existing:
                    name = index.get("name")
                    if not name or name == "_id_" or name not in specs:
                        continue
                    key_spec, options = specs[name]
                    if self._index_spec_matches(index, key_spec, options):
                        continue
                    try:
                        await collection.drop_index(name)
                        logger.info(
                            "Dropped drifted catalog index %s.%s for recreation",
                            collection_name,
                            name,
                        )
                    except Exception as exc:
                        logger.warning(
                            "Failed to drop drifted index %s.%s: %s",
                            collection_name,
                            name,
                            str(exc),
                        )
            except Exception as exc:
                logger.warning(
                    "Catalog drift cleanup skipped for %s: %s", collection_name, str(exc)
                )

    async def _drop_legacy_duplicate_indexes(self) -> None:
        """Drop indexes on catalog-owned collections that the catalog doesn't define."""
        for collection_name in self._CATALOG_OWNED_COLLECTIONS:
            try:
                collection = self.db[collection_name]
                keep = await self._authoritative_index_names(collection_name)
                existing = await collection.list_indexes().to_list(length=200)
                for index in existing:
                    name = index.get("name")
                    # Never touch _id_, text indexes, or catalog-defined indexes.
                    if not name or name in keep or name == "_id_":
                        continue
                    # Preserve any text index (key contains _fts) defensively.
                    if "_fts" in (index.get("key") or {}):
                        continue
                    try:
                        await collection.drop_index(name)
                        logger.info(
                            "Dropped legacy duplicate index %s.%s", collection_name, name
                        )
                    except Exception as exc:
                        logger.warning(
                            "Failed to drop legacy index %s.%s: %s",
                            collection_name,
                            name,
                            str(exc),
                        )
            except Exception as exc:
                logger.warning(
                    "Legacy index cleanup skipped for %s: %s", collection_name, str(exc)
                )

    async def _cleanup_duplicate_usernames(self) -> None:
        """Remove duplicate users before the unique username index is applied."""
        try:
            pipeline: List[Dict[str, Any]] = [
                {"$group": {"_id": "$username", "count": {"$sum": 1}}},
                {"$match": {"count": {"$gt": 1}}},
            ]
            duplicates = await self.db.users.aggregate(pipeline).to_list(None)
            if duplicates:
                logger.warning(
                    f"Found {len(duplicates)} duplicate usernames, cleaning up..."
                )
                for dup in duplicates:
                    await self._cleanup_duplicate_users(dup["_id"])
        except Exception as exc:
            logger.warning("Username duplicate cleanup skipped: %s", str(exc))

    async def _drop_obsolete_serial_indexes(self) -> None:
        """Drop pre-item_id global serial-uniqueness indexes (replaced by item_id keys)."""
        for coll in (self.db.item_serials, self.db.serial_records, self.db.serial_registry):
            await self._drop_index_if_matching(coll, key=[("serial_number", 1)], unique=True)
            await self._drop_index_if_matching(
                coll, key=[("item_code", 1), ("serial_number", 1)], unique=True
            )
            await self._drop_index_if_matching(coll, key=[("serial_no", 1)], unique=True)
            await self._drop_index_if_matching(
                coll, key=[("item_code", 1), ("serial_no", 1)], unique=True
            )

    async def _cleanup_duplicate_users(self, username: str) -> None:
        """Remove duplicate users, keeping the oldest one."""
        users = await self.db.users.find({"username": username}).to_list(None)
        if len(users) > 1:
            to_keep = min(users, key=lambda u: u.get("created_at", datetime.min))
            to_remove = [u for u in users if u["_id"] != to_keep["_id"]]
            for user in to_remove:
                await self.db.users.delete_one({"_id": user["_id"]})
            logger.info(f"Removed {len(to_remove)} duplicate user(s) for username: {username}")

    async def _drop_index_if_matching(
        self,
        collection: Any,
        *,
        key: Union[str, list[tuple[str, int]]],
        unique: Optional[bool] = None,
    ) -> None:
        requested_key = self._normalize_index_key(key)
        existing_indexes = await collection.list_indexes().to_list(length=100)
        for existing in existing_indexes:
            if self._normalize_index_key(existing.get("key", {})) != requested_key:
                continue
            if unique is not None and bool(existing.get("unique", False)) != unique:
                continue
            index_name = existing.get("name")
            if not index_name:
                continue
            try:
                await collection.drop_index(index_name)
                logger.info("Dropped obsolete index %s", index_name)
            except Exception as exc:
                logger.warning("Failed to drop obsolete index %s: %s", index_name, str(exc))

    @staticmethod
    def _normalize_index_key(
        key: Union[str, list[tuple[str, int]], Dict[str, Any], Any],
    ) -> list[tuple[str, Any]]:
        """Normalize index specs so list_indexes() output can be compared with requested keys."""
        if isinstance(key, str):
            return [(key, 1)]
        if isinstance(key, list):
            return list(key)
        if isinstance(key, dict):
            return list(key.items())
        if hasattr(key, "items"):
            return list(key.items())
        return [(str(key), 1)]

    async def run_migrations(self):
        """Run all pending migrations"""
        logger.info("Checking for pending migrations...")

        # Get all migrations
        pending = await self._get_pending_migrations()

        if not pending:
            logger.info("No pending migrations")
            return

        logger.info(f"Running {len(pending)} migration(s)...")

        for migration in pending:
            try:
                await self._run_migration(migration)
                await self._mark_migration_complete(migration["name"])
                logger.info(f"✓ Migration {migration['name']} completed")
            except Exception as e:
                logger.error(f"✗ Migration {migration['name']} failed: {str(e)}")
                raise

    async def _get_pending_migrations(self) -> list[dict[str, Any]]:
        """Get list of pending migrations"""
        all_migrations = [
            {
                "name": "create_indexes_v1",
                "version": 1,
                "description": "Create initial database indexes",
                "func": self.ensure_indexes,
            },
            # Add more migrations here as needed
        ]

        # Get completed migrations
        completed = await self.db[self.migrations_collection].find({}).to_list(1000)
        completed_names = {m["name"] for m in completed}

        # Filter pending
        pending = [m for m in all_migrations if m["name"] not in completed_names]

        return sorted(pending, key=lambda x: x["version"])

    async def _run_migration(self, migration: dict[str, Any]):
        """Run a single migration"""
        logger.info(f"Running migration: {migration['name']}")
        await migration["func"]()

    async def _mark_migration_complete(self, migration_name: str):
        """Mark migration as completed"""
        await self.db[self.migrations_collection].insert_one(
            {
                "name": migration_name,
                "completed_at": datetime.now(timezone.utc).replace(tzinfo=None),
            }
        )
