"""
Database Migrations - MongoDB schema migrations
Handles database schema updates and indexing
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Union

from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.db.indexes import create_indexes as create_optimized_indexes

logger = logging.getLogger(__name__)


class MigrationManager:
    """Manages database schema migrations"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.migrations_collection = "migrations"

    async def ensure_indexes(self):
        """Create database indexes for performance"""
        logger.info("Creating database indexes...")

        try:
            # First create optimized indexes from indexes.py
            logger.info("Applying optimized index definitions...")
            await create_optimized_indexes(self.db)

            # Then ensure standard migration indexes (safely)
            await self._ensure_users_indexes()
            await self._ensure_refresh_tokens_indexes()
            await self._ensure_sessions_indexes()
            await self._ensure_count_lines_indexes()
            await self._ensure_erp_items_indexes()
            await self._ensure_misc_indexes()
            await self._ensure_products_indexes()
            logger.info("All database indexes created successfully")
        except Exception as e:
            logger.error(f"Error creating indexes: {str(e)}")
            raise

    async def _ensure_products_indexes(self) -> None:
        """Create indexes for products collection (used for change detection)."""
        # Note: These are also covered by indexes.py, but ensured here for consistency
        await self._create_index_safe(
            self.db.products, "barcode", unique=True, name="products.barcode"
        )
        await self._create_index_safe(
            self.db.products, [("last_updated", -1)], name="products.updated"
        )
        logger.info("✓ Products indexes created")

    async def _ensure_users_indexes(self) -> None:
        """Create indexes for users collection."""
        # Check for duplicate usernames first
        pipeline: List[Dict[str, Any]] = [
            {"$group": {"_id": "$username", "count": {"$sum": 1}}},
            {"$match": {"count": {"$gt": 1}}},
        ]
        duplicates = await self.db.users.aggregate(pipeline).to_list(None)
        if duplicates:
            logger.warning(f"Found {len(duplicates)} duplicate usernames, cleaning up...")
            for dup in duplicates:
                await self._cleanup_duplicate_users(dup["_id"])

        await self._create_index_safe(self.db.users, "username", unique=True, name="users.username")
        await self._create_index_safe(self.db.users, "role", name="users.role")
        logger.info("✓ Users indexes created")

    async def _cleanup_duplicate_users(self, username: str) -> None:
        """Remove duplicate users, keeping the oldest one."""
        users = await self.db.users.find({"username": username}).to_list(None)
        if len(users) > 1:
            to_keep = min(users, key=lambda u: u.get("created_at", datetime.min))
            to_remove = [u for u in users if u["_id"] != to_keep["_id"]]
            for user in to_remove:
                await self.db.users.delete_one({"_id": user["_id"]})
            logger.info(f"Removed {len(to_remove)} duplicate user(s) for username: {username}")

    async def _ensure_refresh_tokens_indexes(self) -> None:
        """Create indexes for refresh_tokens collection."""
        # Refresh tokens are stored as a one-way hash to reduce blast radius if DB is leaked.
        # Use a sparse unique index so older records without token_hash don't block migrations.
        await self._create_index_safe(
            self.db.refresh_tokens,
            "token_hash",
            unique=True,
            sparse=True,
            name="refresh_tokens.token_hash",
        )
        await self._create_index_safe(self.db.refresh_tokens, "username")
        await self._create_index_safe(self.db.refresh_tokens, "expires_at")
        await self._create_index_safe(self.db.refresh_tokens, [("username", 1), ("revoked", 1)])
        logger.info("✓ Refresh tokens indexes created")

    async def _ensure_sessions_indexes(self) -> None:
        """Create indexes for sessions collection."""
        await self._create_index_safe(self.db.sessions, "id", unique=True, name="sessions.id")
        simple_indexes = ["warehouse", "staff_user", "status"]
        for field in simple_indexes:
            await self._create_index_safe(self.db.sessions, field, name=f"sessions.{field}")

        compound_indexes = [
            [("started_at", -1)],
            [("warehouse", 1), ("status", 1)],
            [("staff_user", 1), ("status", 1)],
            [("status", 1), ("started_at", -1)],
            [("created_at", -1)],
            [("status", 1), ("created_at", -1)],
        ]
        for idx in compound_indexes:
            await self._create_index_safe(self.db.sessions, idx)
        logger.info("✓ Sessions indexes created")

    async def _ensure_count_lines_indexes(self) -> None:
        """Create indexes for count_lines collection."""
        await self._create_index_safe(self.db.count_lines, "id", unique=True, name="count_lines.id")
        await self._create_index_safe(
            self.db.count_lines,
            "idempotency_key",
            unique=True,
            sparse=True,
            name="count_lines.idempotency_key",
        )
        simple_indexes = ["session_id", "item_code", "counted_by", "status", "verified"]
        for field in simple_indexes:
            await self._create_index_safe(self.db.count_lines, field, name=f"count_lines.{field}")

        compound_indexes = [
            [("session_id", 1), ("item_code", 1)],
            [("session_id", 1), ("counted_at", -1)],
            [("session_id", 1), ("status", 1)],
            [("item_code", 1), ("counted_at", -1)],
            [("counted_at", -1)],
            [("item_code", 1), ("verified", 1)],
            [("verified", 1), ("counted_at", -1)],
        ]
        for idx in compound_indexes:
            await self._create_index_safe(self.db.count_lines, idx)
        logger.info("✓ Count lines indexes created")

    async def _ensure_erp_items_indexes(self) -> None:
        """Create indexes for erp_items collection."""
        # NOTE: item_code index is handled by backend/db/indexes.py as 'idx_item_code'
        # await self._create_index_safe(
        #     self.db.erp_items, "item_code", unique=True, name="erp_items.item_code"
        # )

        simple_indexes = [
            # "barcode",  # Handled by backend/db/indexes.py as 'idx_barcode'
            "warehouse",
            # "category",  # Handled by backend/db/indexes.py as part of compound idx_category
            # "subcategory",  # Handled by backend/db/indexes.py as part of compound idx_category
            "floor",
            "rack",
            "uom_code",
            "verified",
            "verified_by",
            "data_complete",
        ]
        for field in simple_indexes:
            await self._create_index_safe(self.db.erp_items, field, name=f"erp_items.{field}")

        compound_indexes = [
            [("verified_at", -1)],
            [("last_scanned_at", -1)],
            [("synced_at", -1)],
            [("last_synced", -1)],
            [("warehouse", 1), ("category", 1)],
            [("barcode", 1), ("warehouse", 1)],
            # [("floor", 1), ("rack", 1)],  # Handled by backend/db/indexes.py as 'idx_location'
            [("verified", 1), ("verified_at", -1)],
            # [("category", 1), ("subcategory", 1)],  # Handled by backend/db/indexes.py as 'idx_category'
            [("warehouse", 1), ("data_complete", 1)],
            [("category", 1), ("data_complete", 1)],
        ]
        for idx in compound_indexes:
            await self._create_index_safe(self.db.erp_items, idx)

        await self._ensure_text_index()
        logger.info("✓ ERP items indexes created")

    async def _ensure_text_index(self) -> None:
        """Create text index on item_name if not exists."""
        try:
            existing_indexes = await self.db.erp_items.list_indexes().to_list(length=100)
            has_text_index = any(
                idx.get("key", {}).get("_fts") is not None for idx in existing_indexes
            )
            if not has_text_index:
                await self.db.erp_items.create_index([("item_name", "text")])
                logger.info("✓ Text index created on item_name")
            else:
                logger.info("✓ Text index already exists, skipping")
        except Exception as e:
            logger.warning(f"Text index check/creation failed: {str(e)}")

    async def _ensure_misc_indexes(self) -> None:
        """Create indexes for miscellaneous collections."""
        # Item variances
        await self._create_index_safe(self.db.item_variances, "item_code")
        await self._create_index_safe(self.db.item_variances, "verified_by")
        await self._create_index_safe(self.db.item_variances, [("verified_at", -1)])
        await self._create_index_safe(self.db.item_variances, [("category", 1), ("floor", 1)])
        await self._create_index_safe(
            self.db.item_variances, [("warehouse", 1), ("verified_at", -1)]
        )
        logger.info("✓ Item variances indexes created")

        # ERP config and sync metadata - skip _id index creation (automatically managed by MongoDB)
        logger.info("✓ ERP config and Sync metadata indexes verified")

        # Activity logs
        await self._create_index_safe(self.db.activity_logs, [("created_at", -1)])
        await self._create_index_safe(self.db.activity_logs, "user_id")
        await self._create_index_safe(self.db.activity_logs, [("user_id", 1), ("created_at", -1)])
        await self._create_index_safe(self.db.activity_logs, "action")
        logger.info("✓ Activity logs indexes created")

    async def _create_index_safe(
        self,
        collection: Any,
        key: Union[str, list[tuple[str, int]]],
        unique: bool = False,
        name: str = "",
        sparse: bool = False,
    ) -> None:
        """Create an index with safe error handling for duplicates."""
        # Skip _id index creation (automatically managed by MongoDB)
        if (
            key == "_id"
            or key == [("_id", 1)]
            or (isinstance(key, list) and len(key) == 1 and key[0][0] == "_id")
        ):
            logger.debug("Skipping _id index creation as it is managed by MongoDB")
            return

        requested_key = self._normalize_index_key(key)
        index_name = name or str(key)

        try:
            existing_indexes = await collection.list_indexes().to_list(length=100)
            for existing in existing_indexes:
                if self._normalize_index_key(existing.get("key", {})) != requested_key:
                    continue

                existing_unique = bool(existing.get("unique", False))
                existing_sparse = bool(existing.get("sparse", False))
                if existing_unique == unique and existing_sparse == sparse:
                    logger.debug(
                        "Index %s already exists with compatible options (existing name: %s)",
                        index_name,
                        existing.get("name", "<unnamed>"),
                    )
                    return

                logger.warning(
                    "Index %s already exists with different options; keeping existing index %s",
                    index_name,
                    existing.get("name", "<unnamed>"),
                )
                return

            create_options: dict[str, Any] = {"unique": unique}
            if name:
                create_options["name"] = name
            if sparse:
                create_options["sparse"] = True

            await collection.create_index(key, **create_options)
        except Exception as e:
            err_str = str(e)
            if "IndexOptionsConflict" in err_str or "already exists" in err_str:
                logger.debug(f"{index_name} index already exists, skipping")
            elif "E11000" in err_str or "duplicate key" in err_str:
                logger.warning(
                    f"Cannot create unique index on {index_name}, duplicates exist: {err_str}"
                )
            elif "InvalidIndexSpecificationOption" in err_str and "unique" in err_str:
                # Handle cases where unique=True is passed for _id or other restricted fields
                logger.debug(f"Retrying index {index_name} without unique option")
                try:
                    await collection.create_index(key, unique=False)
                except Exception as e2:
                    logger.warning(f"Error creating {index_name} index (second attempt): {str(e2)}")
            else:
                logger.warning(f"Error creating {index_name} index: {err_str}")

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
