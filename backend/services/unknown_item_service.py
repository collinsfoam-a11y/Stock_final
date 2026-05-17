"""Governed unknown-item domain service."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from fastapi import HTTPException

from backend.services.concurrency import build_version_filter, coerce_version
from backend.services.count_line_write_service import CountLineWriteService
from backend.services.governance_audit_service import GovernanceAuditService
from backend.services.governance_guard import write_authority
from backend.services.session_lifecycle_service import SessionLifecycleService
from backend.services.transaction_manager import mongo_transaction


class UnknownItemService:
    """Controlled unknown-item flow with governance and audit hooks."""

    AUTHORITY_NAME = "UnknownItemService"

    def __init__(self, db: Any) -> None:
        self.db = db
        self.audit_service = GovernanceAuditService(db)
        self.lifecycle_service = SessionLifecycleService(db)

    @staticmethod
    def _utc_now() -> datetime:
        return datetime.now(timezone.utc).replace(tzinfo=None)

    @staticmethod
    def _resolve_filter(item_id: str) -> dict[str, Any]:
        if ObjectId.is_valid(str(item_id)):
            return {"$or": [{"id": str(item_id)}, {"_id": ObjectId(str(item_id))}]}
        return {"id": str(item_id)}

    @staticmethod
    def _kwargs(db_session: Optional[Any]) -> dict[str, Any]:
        return {"session": db_session} if db_session is not None else {}

    async def _execute_authorized_write(self, write_call: Any) -> Any:
        with write_authority(self.AUTHORITY_NAME):
            result = write_call()
            if hasattr(result, "__await__"):
                return await result
            return result

    async def _map_unknown_to_known_item(
        self,
        *,
        unknown: dict[str, Any],
        target: dict[str, Any],
        actor_id: str,
        resolve_notes: Optional[str],
        db_session: Optional[Any],
        manual_sku_created: bool = False,
    ) -> dict[str, Any]:
        kwargs = self._kwargs(db_session)
        item_id = str(unknown.get("id") or unknown.get("_id") or "")
        item_code = str(target.get("item_code") or "").strip()
        if not item_code:
            raise HTTPException(status_code=400, detail="Target item_code is required")

        session_id = str(unknown.get("session_id") or "").strip()
        session = await self.lifecycle_service.ensure_session_active(
            session_id, db_session=db_session
        )

        location_id = str(unknown.get("location_id") or "").strip()
        floor_id = str(unknown.get("floor_id") or unknown.get("floor_no") or "").strip()
        rack_id = str(unknown.get("rack_id") or unknown.get("rack_no") or "").strip()
        if not location_id or not floor_id or not rack_id:
            raise HTTPException(
                status_code=400,
                detail="CRITICAL: Unknown-item mapping requires location_id, floor_id, rack_id",
            )

        now = self._utc_now()
        new_count_line = {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "location_id": location_id,
            "floor_id": floor_id,
            "rack_id": rack_id,
            "floor_no": floor_id,
            "rack_no": rack_id,
            "item_code": item_code,
            "barcode": target.get("barcode") or unknown.get("barcode"),
            "counted_qty": float(unknown.get("counted_qty") or 1.0),
            "counted_by": unknown.get("reported_by") or actor_id,
            "counted_at": unknown.get("reported_at") or now,
            "updated_at": now,
            "is_mapped_from_unknown": True,
            "mapping_notes": resolve_notes,
            "mapped_by": actor_id,
            "idempotency_key": f"unknown-map:{item_id}:{item_code}",
            "version": 1,
            "previous_version_id": None,
            "recount_of_id": None,
        }

        write_service = CountLineWriteService(self.db)
        await write_service.process_write(
            {"operation": "insert_one", "document": new_count_line},
            context={
                "session": session,
                "session_id": session_id,
                "username": actor_id,
                "db_session": db_session,
            },
        )

        expected_version = coerce_version(unknown.get("version"))
        result = await self._execute_authorized_write(
            lambda: self.db.unknown_items.update_one(
                {
                    **self._resolve_filter(item_id),
                    **build_version_filter(expected_version),
                },
                {
                    "$set": {
                        "status": "RESOLVED",
                        "resolved_at": now,
                        "resolved_by": actor_id,
                        "resolution": "MAPPED",
                        "target_item_code": item_code,
                        "resolve_notes": resolve_notes,
                        "updated_at": now,
                        "updated_by": actor_id,
                    },
                    "$inc": {"version": 1},
                },
                **kwargs,
            )
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=409, detail="Unknown item concurrent update conflict")

        await self.audit_service.log_write_event(
            event="UNKNOWN_ITEM_WRITE",
            operation="RESOLVE_TO_KNOWN_ITEM",
            session_id=session_id,
            item_id=new_count_line.get("item_code"),
            location_id=location_id,
            actor_id=actor_id,
            version=1,
            idempotency_key=new_count_line.get("idempotency_key"),
            semantic_hash=new_count_line.get("semantic_hash"),
            metadata={
                "unknown_item_id": item_id,
                "target_item_code": item_code,
                "count_line_id": new_count_line["id"],
                "manual_sku_created": manual_sku_created,
            },
            db_session=db_session,
        )

        return {
            "unknown_item_id": item_id,
            "target_item_code": item_code,
            "count_line_id": new_count_line["id"],
            "manual_sku_created": manual_sku_created,
        }

    async def register_unknown_item(
        self,
        *,
        payload: dict[str, Any],
        actor_id: str,
    ) -> dict[str, Any]:
        session_id = str(payload.get("session_id") or "").strip()
        if not session_id:
            raise HTTPException(status_code=400, detail="session_id is required")

        location_id = str(payload.get("location_id") or "").strip()
        floor_id = str(payload.get("floor_id") or payload.get("floor_no") or "").strip()
        rack_id = str(payload.get("rack_id") or payload.get("rack_no") or "").strip()
        if not location_id or not floor_id or not rack_id:
            raise HTTPException(
                status_code=400,
                detail="CRITICAL: location_id, floor_id, rack_id are required",
            )

        now = self._utc_now()
        doc = dict(payload)
        doc["id"] = str(doc.get("id") or uuid.uuid4())
        doc["session_id"] = session_id
        doc["location_id"] = location_id
        doc["floor_id"] = floor_id
        doc["rack_id"] = rack_id
        doc.setdefault("floor_no", floor_id)
        doc.setdefault("rack_no", rack_id)
        doc.setdefault("counted_qty", 1.0)
        doc.setdefault("status", "OPEN")
        doc.setdefault("version", 1)
        doc["reported_by"] = actor_id
        doc["reported_at"] = now
        doc["updated_at"] = now

        async with mongo_transaction(self.db.client) as tx:
            await self.lifecycle_service.ensure_session_active(session_id, db_session=tx)
            kwargs = self._kwargs(tx)
            await self._execute_authorized_write(
                lambda: self.db.unknown_items.insert_one(doc, **kwargs)
            )
            await self.audit_service.log_write_event(
                event="UNKNOWN_ITEM_WRITE",
                operation="REGISTER",
                session_id=session_id,
                item_id=doc.get("barcode") or doc.get("id"),
                location_id=location_id,
                actor_id=actor_id,
                version=int(doc.get("version") or 1),
                metadata={"unknown_item_id": doc["id"]},
                db_session=tx,
            )

        return doc

    async def attach_to_session(
        self,
        *,
        item_id: str,
        session_id: str,
        location_id: str,
        floor_id: str,
        rack_id: str,
        actor_id: str,
    ) -> dict[str, Any]:
        async with mongo_transaction(self.db.client) as tx:
            await self.lifecycle_service.ensure_session_active(session_id, db_session=tx)
            kwargs = self._kwargs(tx)
            existing = await self.db.unknown_items.find_one(self._resolve_filter(item_id), **kwargs)
            if not existing:
                raise HTTPException(status_code=404, detail="Unknown item report not found")

            now = self._utc_now()
            expected_version = coerce_version(existing.get("version"))
            result = await self._execute_authorized_write(
                lambda: self.db.unknown_items.update_one(
                    {
                        **self._resolve_filter(item_id),
                        **build_version_filter(expected_version),
                    },
                    {
                        "$set": {
                            "session_id": session_id,
                            "location_id": location_id,
                            "floor_id": floor_id,
                            "rack_id": rack_id,
                            "floor_no": floor_id,
                            "rack_no": rack_id,
                            "updated_at": now,
                            "updated_by": actor_id,
                        },
                        "$inc": {"version": 1},
                    },
                    **kwargs,
                )
            )
            if result.modified_count == 0:
                raise HTTPException(
                    status_code=409, detail="Unknown item concurrent update conflict"
                )

            refreshed = await self.db.unknown_items.find_one(
                self._resolve_filter(item_id), **kwargs
            )
            await self.audit_service.log_write_event(
                event="UNKNOWN_ITEM_WRITE",
                operation="ATTACH_TO_SESSION",
                session_id=session_id,
                item_id=(refreshed or {}).get("barcode") or item_id,
                location_id=location_id,
                actor_id=actor_id,
                version=int((refreshed or {}).get("version") or 1),
                metadata={"unknown_item_id": str((refreshed or {}).get("id") or item_id)},
                db_session=tx,
            )
            return refreshed or dict(existing)

    async def escalate_for_review(
        self,
        *,
        item_id: str,
        actor_id: str,
        reason: Optional[str] = None,
    ) -> dict[str, Any]:
        async with mongo_transaction(self.db.client) as tx:
            kwargs = self._kwargs(tx)
            existing = await self.db.unknown_items.find_one(self._resolve_filter(item_id), **kwargs)
            if not existing:
                raise HTTPException(status_code=404, detail="Unknown item report not found")

            session_id = str(existing.get("session_id") or "").strip()
            if session_id:
                await self.lifecycle_service.ensure_session_not_finalized(
                    session_id,
                    db_session=tx,
                )

            now = self._utc_now()
            expected_version = coerce_version(existing.get("version"))
            result = await self._execute_authorized_write(
                lambda: self.db.unknown_items.update_one(
                    {
                        **self._resolve_filter(item_id),
                        **build_version_filter(expected_version),
                    },
                    {
                        "$set": {
                            "status": "ESCALATED",
                            "escalated_at": now,
                            "escalated_by": actor_id,
                            "escalation_reason": reason,
                            "updated_at": now,
                            "updated_by": actor_id,
                        },
                        "$inc": {"version": 1},
                    },
                    **kwargs,
                )
            )
            if result.modified_count == 0:
                raise HTTPException(
                    status_code=409, detail="Unknown item concurrent update conflict"
                )

            refreshed = await self.db.unknown_items.find_one(
                self._resolve_filter(item_id), **kwargs
            )
            await self.audit_service.log_write_event(
                event="UNKNOWN_ITEM_WRITE",
                operation="ESCALATE",
                session_id=session_id,
                item_id=(refreshed or {}).get("barcode") or item_id,
                location_id=(refreshed or {}).get("location_id"),
                actor_id=actor_id,
                version=int((refreshed or {}).get("version") or 1),
                metadata={"unknown_item_id": str((refreshed or {}).get("id") or item_id)},
                db_session=tx,
            )
            return refreshed or dict(existing)

    async def resolve_to_known_item(
        self,
        *,
        item_id: str,
        item_code: str,
        actor_id: str,
        resolve_notes: Optional[str] = None,
    ) -> dict[str, Any]:
        async with mongo_transaction(self.db.client) as tx:
            kwargs = self._kwargs(tx)
            unknown = await self.db.unknown_items.find_one(self._resolve_filter(item_id), **kwargs)
            if not unknown:
                raise HTTPException(status_code=404, detail="Unknown item report not found")

            target = await self.db.erp_items.find_one({"item_code": item_code}, **kwargs)
            if not target:
                raise HTTPException(
                    status_code=404, detail=f"Target SKU {item_code} not found in ERP"
                )
            return await self._map_unknown_to_known_item(
                unknown=unknown,
                target=target,
                actor_id=actor_id,
                resolve_notes=resolve_notes,
                db_session=tx,
            )

    async def create_manual_sku_and_resolve(
        self,
        *,
        item_id: str,
        item_code: str,
        item_name: str,
        category: str,
        subcategory: Optional[str],
        mrp: float,
        uom_code: str,
        actor_id: str,
        resolve_notes: Optional[str] = None,
    ) -> dict[str, Any]:
        async with mongo_transaction(self.db.client) as tx:
            kwargs = self._kwargs(tx)
            unknown = await self.db.unknown_items.find_one(self._resolve_filter(item_id), **kwargs)
            if not unknown:
                raise HTTPException(status_code=404, detail="Unknown item report not found")

            existing_erp_item = await self.db.erp_items.find_one({"item_code": item_code}, **kwargs)
            existing_manual_item = await self.db.manual_items.find_one(
                {"item_code": item_code}, **kwargs
            )
            if existing_erp_item or existing_manual_item:
                raise HTTPException(status_code=400, detail="Item code already exists")

            new_item = {
                "id": str(uuid.uuid4()),
                "item_code": item_code,
                "item_name": item_name,
                "barcode": unknown.get("barcode") or "",
                "category": category,
                "subcategory": subcategory,
                "mrp": mrp,
                "uom_code": uom_code,
                "stock_qty": 0.0,
                "source": "manual",
                "created_at": self._utc_now(),
                "created_by": actor_id,
                "is_manually_created": True,
            }
            result = await self._execute_authorized_write(
                lambda: self.db.manual_items.insert_one(new_item, **kwargs)
            )
            new_item["_id"] = getattr(result, "inserted_id", None)

            return await self._map_unknown_to_known_item(
                unknown=unknown,
                target=new_item,
                actor_id=actor_id,
                resolve_notes=resolve_notes,
                db_session=tx,
                manual_sku_created=True,
            )

    async def dismiss_unknown_item(
        self,
        *,
        item_id: str,
        actor_id: str,
        reason: Optional[str] = None,
    ) -> dict[str, Any]:
        async with mongo_transaction(self.db.client) as tx:
            kwargs = self._kwargs(tx)
            existing = await self.db.unknown_items.find_one(self._resolve_filter(item_id), **kwargs)
            if not existing:
                raise HTTPException(status_code=404, detail="Unknown item report not found")

            session_id = str(existing.get("session_id") or "").strip()
            if session_id:
                await self.lifecycle_service.ensure_session_not_finalized(session_id, db_session=tx)

            expected_version = coerce_version(existing.get("version"))
            now = self._utc_now()
            update_fields = {
                "status": "DISMISSED",
                "dismissed_at": now,
                "dismissed_by": actor_id,
                "updated_at": now,
                "updated_by": actor_id,
            }
            if reason:
                update_fields["dismiss_reason"] = reason

            result = await self._execute_authorized_write(
                lambda: self.db.unknown_items.update_one(
                    {
                        **self._resolve_filter(item_id),
                        **build_version_filter(expected_version),
                    },
                    {"$set": update_fields, "$inc": {"version": 1}},
                    **kwargs,
                )
            )
            if result.modified_count == 0:
                raise HTTPException(
                    status_code=409, detail="Unknown item concurrent update conflict"
                )

            refreshed = await self.db.unknown_items.find_one(
                self._resolve_filter(item_id), **kwargs
            )
            resolved_doc = refreshed or {
                **existing,
                **update_fields,
                "version": expected_version + 1,
            }
            await self.audit_service.log_write_event(
                event="UNKNOWN_ITEM_WRITE",
                operation="DISMISS",
                session_id=session_id or None,
                item_id=resolved_doc.get("barcode") or str(resolved_doc.get("id") or item_id),
                location_id=resolved_doc.get("location_id"),
                actor_id=actor_id,
                version=int(resolved_doc.get("version") or expected_version + 1),
                metadata={"unknown_item_id": str(resolved_doc.get("id") or item_id)},
                db_session=tx,
            )
            return resolved_doc
