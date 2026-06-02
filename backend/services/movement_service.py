from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException

from backend.services.governance_guard import write_authority
from backend.tenancy.org_context import get_current_org_id


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _as_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid movement quantity")


def _normalize_str(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


class MovementService:
    AUTHORITY_NAME = "MovementService"

    def __init__(self, db: Any) -> None:
        self.db = db

    @staticmethod
    def _kwargs(db_session: Optional[Any]) -> dict[str, Any]:
        return {"session": db_session} if db_session is not None else {}

    async def _execute_authorized_write(self, write_call: Any) -> Any:
        with write_authority(self.AUTHORITY_NAME):
            result = write_call()
            if hasattr(result, "__await__"):
                return await result
            return result

    async def create_manual_movement(
        self,
        *,
        session_id: Optional[str],
        warehouse: str,
        item_code: str,
        movement_type: str,
        quantity: Any,
        occurred_at: Optional[datetime],
        reason_code: str,
        reason: Optional[str],
        actor_username: str,
        device_id: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
        db_session: Optional[Any] = None,
    ) -> dict[str, Any]:
        normalized_item_code = _normalize_str(item_code)
        if not normalized_item_code:
            raise HTTPException(status_code=400, detail="item_code is required")

        normalized_warehouse = _normalize_str(warehouse)
        if not normalized_warehouse:
            raise HTTPException(status_code=400, detail="warehouse is required")

        normalized_type = _normalize_str(movement_type)
        if not normalized_type:
            raise HTTPException(status_code=400, detail="movement_type is required")

        normalized_reason_code = _normalize_str(reason_code)
        if not normalized_reason_code:
            raise HTTPException(status_code=400, detail="reason_code is required")

        normalized_actor = _normalize_str(actor_username)
        if not normalized_actor:
            raise HTTPException(status_code=400, detail="actor_username is required")

        qty = _as_float(quantity)
        if qty == 0:
            raise HTTPException(status_code=400, detail="quantity must be non-zero")

        now = _utc_now()
        doc = {
            "id": str(uuid.uuid4()),
            "org_id": get_current_org_id(),
            "source": "MANUAL",
            "session_id": _normalize_str(session_id) if session_id else None,
            "warehouse": normalized_warehouse,
            "item_code": normalized_item_code,
            "movement_type": normalized_type,
            "quantity": qty,
            "occurred_at": occurred_at or now,
            "created_at": now,
            "created_by": normalized_actor,
            "device_id": _normalize_str(device_id) if device_id else None,
            "reason_code": normalized_reason_code,
            "reason": _normalize_str(reason) if reason else None,
            "metadata": metadata or {},
        }
        kwargs = self._kwargs(db_session)
        await self._execute_authorized_write(
            lambda: self.db.inventory_movements.insert_one(doc, **kwargs)
        )
        return doc

    async def ingest_erp_movements(
        self,
        *,
        movements: list[dict[str, Any]],
        source_system: str,
        ingested_by: str,
        db_session: Optional[Any] = None,
    ) -> dict[str, Any]:
        normalized_source = _normalize_str(source_system)
        if not normalized_source:
            raise HTTPException(status_code=400, detail="source_system is required")

        normalized_actor = _normalize_str(ingested_by)
        if not normalized_actor:
            raise HTTPException(status_code=400, detail="ingested_by is required")

        if not isinstance(movements, list) or not movements:
            raise HTTPException(status_code=400, detail="movements must be a non-empty list")

        now = _utc_now()
        docs: list[dict[str, Any]] = []
        for raw in movements:
            if not isinstance(raw, dict):
                raise HTTPException(status_code=400, detail="Invalid movement payload")

            normalized_item_code = _normalize_str(raw.get("item_code"))
            normalized_warehouse = _normalize_str(raw.get("warehouse"))
            normalized_type = _normalize_str(raw.get("movement_type"))
            if not normalized_item_code or not normalized_warehouse or not normalized_type:
                raise HTTPException(
                    status_code=400,
                    detail="movement requires item_code, warehouse, movement_type",
                )

            qty = _as_float(raw.get("quantity"))
            if qty == 0:
                raise HTTPException(status_code=400, detail="quantity must be non-zero")

            occurred_at = raw.get("occurred_at")
            if occurred_at is not None and not isinstance(occurred_at, datetime):
                raise HTTPException(status_code=400, detail="occurred_at must be a datetime")

            docs.append(
                {
                    "id": str(raw.get("id") or uuid.uuid4()),
                    "org_id": get_current_org_id(),
                    "source": "ERP",
                    "source_system": normalized_source,
                    "external_ref": _normalize_str(raw.get("external_ref")),
                    "warehouse": normalized_warehouse,
                    "item_code": normalized_item_code,
                    "movement_type": normalized_type,
                    "quantity": qty,
                    "occurred_at": occurred_at or now,
                    "created_at": now,
                    "created_by": normalized_actor,
                    "metadata": raw.get("metadata") or {},
                }
            )

        kwargs = self._kwargs(db_session)
        await self._execute_authorized_write(
            lambda: self.db.inventory_movements.insert_many(docs, ordered=True, **kwargs)
        )
        return {"inserted_count": len(docs), "movement_ids": [doc["id"] for doc in docs]}
