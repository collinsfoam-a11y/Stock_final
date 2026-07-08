"""HSN directory + suggestion API (BSR Step 10).

Read-only suggestion surface plus admin-only directory import. Never talks
to ERPNext, never pushes anything, never mutates the SQL item master.
Suggestion selection (which creates a correction proposal) lives on the
existing `erpnext_exports_api.py` router alongside the rest of the
correction-proposal workflow.
"""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.auth.dependencies import require_admin
from backend.auth.permissions import Permission, require_permission
from backend.db.runtime import get_db
from backend.services.hsn_directory_service import HsnDirectoryError, HsnDirectoryService
from backend.services.hsn_suggestion_selection_service import HsnSuggestionSelectionService
from backend.services.hsn_suggestion_service import HsnSuggestionService

router = APIRouter(tags=["HSN Directory"])


class HsnDirectoryImportRequest(BaseModel):
    hsn_sac: str
    description: str
    source: str
    gst_percentage: Optional[float] = None
    source_url: Optional[str] = None
    source_file: Optional[str] = None
    is_official_source: Optional[bool] = None
    keywords: Optional[list[str]] = None
    metadata: Optional[dict[str, Any]] = None


@router.post("/api/hsn-directory/import")
async def import_hsn_directory_record(
    payload: HsnDirectoryImportRequest,
    current_user: dict = Depends(require_admin),
):
    """Admin-only. Imports one source-tracked HSN/SAC directory record. See
    HsnDirectoryService for the never-silently-overwrite-a-different-
    source's-record guarantee."""
    db: AsyncIOMotorDatabase = get_db()
    service = HsnDirectoryService(db)
    try:
        return await service.import_record(current_user=current_user, **payload.model_dump())
    except HsnDirectoryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/api/hsn-directory/search")
async def search_hsn_directory(
    q: str = Query(default=""),
    current_user: dict = require_permission(Permission.EXPORT_ALL),
):
    db: AsyncIOMotorDatabase = get_db()
    service = HsnDirectoryService(db)
    return {"results": await service.search(q)}


class HsnSuggestionRequest(BaseModel):
    item_name: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    brand: Optional[str] = None
    barcode: Optional[str] = None
    photo_caption: Optional[str] = None
    limit: int = 5


@router.post("/api/items/{item_code}/hsn-suggestions")
async def get_hsn_suggestions(
    item_code: str,
    payload: HsnSuggestionRequest,
    current_user: dict = require_permission(Permission.EXPORT_ALL),
):
    """Never classifies HSN directly from an image -- `photo_caption` must
    already be caption/keyword text, not raw image bytes. Never mutates the
    SQL item master, a preview row, or an export row. Each returned
    suggestion is cached with a `suggestion_id` so a human's later selection
    (see erpnext_exports_api.py's suggestion-selection endpoint) can look up
    its provenance."""
    db: AsyncIOMotorDatabase = get_db()
    suggestion_service = HsnSuggestionService(db)
    result = await suggestion_service.suggest(
        item_code=item_code,
        item_name=payload.item_name,
        category=payload.category,
        subcategory=payload.subcategory,
        brand=payload.brand,
        barcode=payload.barcode,
        photo_caption=payload.photo_caption,
        limit=payload.limit,
    )
    selection_service = HsnSuggestionSelectionService(db)
    result["suggestions"] = await selection_service.cache_suggestions(
        item_code=item_code, suggestions=result["suggestions"]
    )
    return result
