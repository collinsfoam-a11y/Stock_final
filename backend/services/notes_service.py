"""Persistence helpers for notes endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId

from backend.db.runtime import get_db


class NotesService:
    def __init__(self, database: Any) -> None:
        self._database = database

    async def list_notes(
        self,
        *,
        query: dict[str, Any],
        page: int,
        page_size: int,
    ) -> tuple[list[dict[str, Any]], int]:
        total_items = await self._database["notes"].count_documents(query)
        skip = (page - 1) * page_size
        cursor = (
            self._database["notes"].find(query).sort("created_at", -1).skip(skip).limit(page_size)
        )
        return [doc async for doc in cursor], total_items

    async def create_note(
        self,
        *,
        title: str,
        content: str,
        created_by: str | None,
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        doc = {
            "title": title,
            "content": content,
            "created_at": now,
            "updated_at": None,
            "created_by": created_by,
        }
        result = await self._database["notes"].insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def delete_note(self, *, note_id: ObjectId, delete_filter: dict[str, Any]) -> int:
        result = await self._database["notes"].delete_one(delete_filter)
        return int(result.deleted_count)


def get_notes_service() -> NotesService:
    return NotesService(get_db())
