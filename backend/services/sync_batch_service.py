"""Service boundary for offline batch-sync persistence."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import Depends
from fastapi.params import Depends as DependsParam
from pymongo.errors import BulkWriteError, DuplicateKeyError

from backend.db.runtime import get_db
from backend.services.count_line_write_service import CountLineWriteService
from backend.services.session_lifecycle_service import SessionLifecycleService
from backend.services.sync_conflicts_service import SyncConflictsService


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _bulk_write_error_is_duplicate_only(exc: BulkWriteError) -> bool:
    details = exc.details if isinstance(exc.details, dict) else {}
    write_errors = details.get("writeErrors")
    if not isinstance(write_errors, list) or not write_errors:
        return False
    return all(isinstance(error, dict) and error.get("code") == 11000 for error in write_errors)


class SyncBatchService:
    def __init__(self, database: Any) -> None:
        self._database = database

    @property
    def database(self) -> Any:
        return self._database

    @property
    def client(self) -> Any:
        return getattr(self._database, "client", None)

    def write_service(self) -> CountLineWriteService:
        return CountLineWriteService(self._database)

    def lifecycle_service(self) -> SessionLifecycleService:
        return SessionLifecycleService(self._database)

    def conflicts_service(self) -> SyncConflictsService:
        return SyncConflictsService(self._database)

    async def item_code_is_known(self, *, session_id: str, item_code: str) -> bool:
        snapshot = await self._database.session_snapshots.find_one({"session_id": session_id})
        if snapshot:
            items = snapshot.get("items") if isinstance(snapshot, dict) else None
            if isinstance(items, list):
                return any(
                    str(item.get("item_code") or "").strip() == item_code
                    for item in items
                    if isinstance(item, dict)
                )
        return bool(await self._database.erp_items.find_one({"item_code": item_code}))

    async def find_item_serial(self, serial_number: str) -> dict[str, Any] | None:
        return await self._database.item_serials.find_one({"serial_number": serial_number})

    async def insert_item_serials_ignore_duplicates(self, serial_docs: list[dict[str, Any]]) -> None:
        try:
            await self._database.item_serials.insert_many(serial_docs, ordered=False)
        except DuplicateKeyError:
            return
        except BulkWriteError as exc:
            if not _bulk_write_error_is_duplicate_only(exc):
                raise

    async def get_idempotency_operation(self, operation_id: str) -> dict[str, Any] | None:
        return await self._database.idempotency_operations.find_one(
            {"operation_id": operation_id}
        )

    async def record_idempotency_operation(
        self, *, operation_id: str, client_record_id: str, session_id: str
    ) -> None:
        await self._database.idempotency_operations.update_one(
            {"operation_id": operation_id},
            {
                "$setOnInsert": {
                    "operation_id": operation_id,
                    "record_id": operation_id,
                    "client_record_id": client_record_id,
                    "session_id": session_id,
                    "created_at": _utc_now(),
                }
            },
            upsert=True,
        )

    async def find_session_by_offline_id(self, offline_id: Optional[Any]) -> dict[str, Any] | None:
        if not offline_id:
            return None
        return await self._database.sessions.find_one({"offline_id": str(offline_id)})

    async def find_existing_open_session(
        self, *, staff_user: str, warehouse_query: dict[str, Any]
    ) -> dict[str, Any] | None:
        return await self._database.sessions.find_one(
            {
                "staff_user": staff_user,
                "status": {"$in": ["OPEN", "ACTIVE", "RECONCILE"]},
                "warehouse": warehouse_query,
            }
        )

    async def count_line_is_idempotent(
        self, *, session_id: str, idempotency_key: Any
    ) -> bool:
        if not idempotency_key:
            return False
        existing = await self._database.count_lines.find_one(
            {"session_id": session_id, "idempotency_key": idempotency_key}
        )
        return bool(existing)

    async def find_erp_item_for_line(self, line_data: dict[str, Any]) -> dict[str, Any] | None:
        barcode = line_data.get("barcode")
        item_code = line_data.get("item_code")
        if barcode:
            item = await self._database.erp_items.find_one({"barcode": barcode})
            if item:
                return item
        if item_code:
            return await self._database.erp_items.find_one({"item_code": item_code})
        return None


def get_sync_batch_service(database: Any = Depends(get_db)) -> SyncBatchService:
    if isinstance(database, DependsParam):
        database = get_db()
    return SyncBatchService(database)
