import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel

from backend.core.database import db
from backend.core.globals import cache_service
from backend.exceptions import (
    ERPCacheUpdateError,
    ERPInvalidResponseError,
    ERPItemNotFoundError,
    ERPRefreshInProgressError,
    SQLConnectionTimeoutError,
    SQLQueryError,
    SQLUnavailableError,
)
from backend.services.audit_service import AuditService
from backend.services.lock_service import LockService, ResourceLockedError
from backend.services.sql_sync_service import SQLSyncService

lock_service = LockService(db)
audit_service = AuditService(db)

logger = logging.getLogger(__name__)

sql_sync_service: SQLSyncService | None = None


@dataclass(frozen=True)
class ResolvedERPIdentity:
    requested_identifier: str
    identifier_type: Literal["barcode", "item_code"]
    quantity_scope: Literal["batch", "item_total"]
    item_code: str
    barcode: str | None
    batch_id: str | int | None
    lock_key: str


class ERPRefreshWarning(BaseModel):
    code: str
    message: str


class ERPRefreshResponse(BaseModel):
    success: bool
    requested_identifier: str
    resolved_identifier_type: Literal["barcode", "item_code"]
    quantity_scope: Literal["batch", "item_total"]
    item_code: str
    barcode: str | None
    batch_id: str | int | None
    previous_qty: float
    current_qty: float
    delta: float
    changed: bool
    mongo_updated: bool
    cache_invalidated: bool
    baseline_changed: Literal[False] = False
    source: Literal["sql_server"] = "sql_server"
    sql_checked_at: datetime
    request_id: str
    warnings: list[ERPRefreshWarning] = []


class CacheInvalidationResult(BaseModel):
    attempted: list[str]
    deleted: list[str]
    failed: list[str]

    @property
    def complete(self) -> bool:
        return not self.failed


class ItemRefreshLock:
    def __init__(self, lock_service, owner: str):
        self.lock_service = lock_service
        self.owner = owner
        self.key = None

    async def acquire(self, key: str, ttl_seconds: int = 20):
        self.key = key
        try:
            await self.lock_service.acquire_lock(key=key, owner=self.owner, ttl_seconds=ttl_seconds)
            return self
        except ResourceLockedError as e:
            raise ERPRefreshInProgressError(retry_after=2) from e

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.key:
            await self.lock_service.release_lock(key=self.key, owner=self.owner)


class ItemRefreshService:
    sql_sync_service: Optional["SQLSyncService"] = None

    def __init__(self):
        pass

    async def invalidate_item_cache(
        self, *, barcode: str | None, item_code: str | None
    ) -> CacheInvalidationResult:
        attempted = []
        deleted = []
        failed = []

        keys_to_invalidate = []
        if barcode:
            keys_to_invalidate.extend([barcode, f"enhanced_{barcode}"])
        if item_code:
            keys_to_invalidate.extend([item_code, f"enhanced_{item_code}"])

        # Deduplicate
        keys_to_invalidate = list(set(keys_to_invalidate))
        for key in keys_to_invalidate:
            attempted.append(key)
            try:
                if cache_service:
                    await cache_service.delete("items", key)
                deleted.append(key)
            except Exception as e:
                logger.error(f"Failed to invalidate cache key items:{key}: {e}")
                failed.append(key)

        return CacheInvalidationResult(attempted=attempted, deleted=deleted, failed=failed)

    async def resolve_identifier(self, identifier: str) -> ResolvedERPIdentity:
        # 1. Local by exact barcode
        local_item = await db.erp_items.find_one({"barcode": identifier})
        if local_item:
            return ResolvedERPIdentity(
                requested_identifier=identifier,
                identifier_type="barcode",
                quantity_scope="batch",
                item_code=local_item.get("item_code"),
                barcode=local_item.get("barcode"),
                batch_id=local_item.get("batch_id"),
                lock_key=(
                    f"erp-item-refresh:batch:{local_item.get('batch_id')}"
                    if local_item.get("batch_id")
                    else f"erp-item-refresh:barcode:{local_item.get('barcode')}"
                ),
            )

        # 2. Local by exact item_code
        local_item = await db.erp_items.find_one({"item_code": identifier})
        if local_item:
            return ResolvedERPIdentity(
                requested_identifier=identifier,
                identifier_type="item_code",
                quantity_scope="item_total",
                item_code=local_item.get("item_code"),
                barcode=local_item.get("barcode"),
                batch_id=local_item.get("batch_id"),
                lock_key=f"erp-item-refresh:item:{local_item.get('item_code')}",
            )

        # 3. SQL barcode fallback (if we had a direct SQL lookup here, but let's assume we use sql_sync_service)
        # We will use the existing sql_sync_service.sql_connector
        if not sql_sync_service:
            raise SQLUnavailableError("SQL Sync Service not configured")

        is_connected = await asyncio.to_thread(sql_sync_service.sql_connector.test_connection)
        if not is_connected:
            raise SQLUnavailableError()

        sql_item = await asyncio.to_thread(
            sql_sync_service.sql_connector.get_item_by_barcode, identifier
        )
        if sql_item:
            return ResolvedERPIdentity(
                requested_identifier=identifier,
                identifier_type="barcode",
                quantity_scope="batch",
                item_code=sql_item.get("item_code"),
                barcode=sql_item.get("barcode"),
                batch_id=sql_item.get("batch_id"),
                lock_key=(
                    f"erp-item-refresh:batch:{sql_item.get('batch_id')}"
                    if sql_item.get("batch_id")
                    else f"erp-item-refresh:barcode:{sql_item.get('barcode')}"
                ),
            )

        sql_item = await asyncio.to_thread(
            sql_sync_service.sql_connector.get_item_by_code, identifier
        )
        if sql_item:
            return ResolvedERPIdentity(
                requested_identifier=identifier,
                identifier_type="item_code",
                quantity_scope="item_total",
                item_code=sql_item.get("item_code"),
                barcode=sql_item.get("barcode"),
                batch_id=sql_item.get("batch_id"),
                lock_key=f"erp-item-refresh:item:{sql_item.get('item_code')}",
            )

        raise ERPItemNotFoundError(identifier)

    async def refresh_single_item_by_identifier(
        self,
        identifier: str,
        *,
        actor: dict[str, Any],
        request_id: str,
    ) -> ERPRefreshResponse:
        warnings = []

        # 1. Resolve identity
        identity = await self.resolve_identifier(identifier)

        # 2. Acquire Distributed Lock
        lock = ItemRefreshLock(lock_service, owner=f"refresh-{request_id}")
        async with await lock.acquire(key=identity.lock_key, ttl_seconds=20):
            # Fetch local Mongo snapshot for previous_qty
            local_snapshot = await db.erp_items.find_one({"item_code": identity.item_code})
            previous_qty = local_snapshot.get("stock_qty", 0.0) if local_snapshot else 0.0

            # 3. Call SQLSyncService
            if not sql_sync_service:
                raise SQLUnavailableError("SQL Sync Service not configured")

            try:
                # We defer to the correct method based on scope
                if identity.quantity_scope == "batch" and identity.barcode:
                    updated_mongo_item = await sql_sync_service.sync_single_item_by_barcode(
                        identity.barcode
                    )
                else:
                    # Item code - need to make sure this method exists
                    updated_mongo_item = await sql_sync_service.sync_single_item_by_code(
                        identity.item_code
                    )
            except Exception as e:
                # sql_sync_service should already raise typed exceptions. If it leaks raw exceptions, we map them here
                if isinstance(
                    e,
                    (
                        SQLUnavailableError,
                        SQLConnectionTimeoutError,
                        SQLQueryError,
                        ERPCacheUpdateError,
                        ERPItemNotFoundError,
                    ),
                ):
                    raise
                logger.error(f"Raw exception in SQLSyncService: {e}", exc_info=True)
                raise ERPInvalidResponseError(item_code=identity.item_code) from e

            if not updated_mongo_item:
                # If it's still returning None for some reason, throw Not Found
                raise ERPItemNotFoundError(identifier)

            current_qty = updated_mongo_item.get("stock_qty", 0.0)
            delta = current_qty - previous_qty
            changed = delta != 0

            # 4. Invalidate Cache
            cache_result = await self.invalidate_item_cache(
                barcode=identity.barcode, item_code=identity.item_code
            )

            if not cache_result.complete:
                warnings.append(
                    ERPRefreshWarning(
                        code="ERP_CACHE_INVALIDATION_FAILED",
                        message="ERP stock updated, but cached views may take time to refresh",
                    )
                )

            # 5. Audit Logging
            try:
                await audit_service.log_event(
                    action="ERP_ITEM_REFRESHED",
                    actor=actor.get("username", "system"),
                    entity="Item",
                    entity_id=identity.item_code,
                    details={
                        "requested_identifier": identity.requested_identifier,
                        "barcode": identity.barcode,
                        "item_code": identity.item_code,
                        "batch_id": identity.batch_id,
                        "quantity_scope": identity.quantity_scope,
                        "previous_qty": previous_qty,
                        "current_qty": current_qty,
                        "delta": delta,
                        "source": "sql_server",
                        "request_id": request_id,
                    },
                )
            except Exception as e:
                logger.error(f"Audit failed for ERP refresh: {e}")
                warnings.append(
                    ERPRefreshWarning(
                        code="ERP_REFRESH_AUDIT_FAILED",
                        message="The stock was refreshed, but the audit event could not be recorded.",
                    )
                )
                # For strict mode, we might throw here, but default to warn.
                # If ERP_REFRESH_REQUIRE_AUDIT is configured, we'd fail here.

            return ERPRefreshResponse(
                success=True,
                requested_identifier=identity.requested_identifier,
                resolved_identifier_type=identity.identifier_type,
                quantity_scope=identity.quantity_scope,
                item_code=identity.item_code,
                barcode=identity.barcode,
                batch_id=identity.batch_id,
                previous_qty=previous_qty,
                current_qty=current_qty,
                delta=delta,
                changed=changed,
                mongo_updated=True,
                cache_invalidated=cache_result.complete,
                baseline_changed=False,
                source="sql_server",
                sql_checked_at=datetime.now(timezone.utc),
                request_id=request_id,
                warnings=warnings,
            )


item_refresh_service = ItemRefreshService()
