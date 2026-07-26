"""Guarded development/test-only APIs for deterministic E2E fixture control.

EXEMPT: test-only mutation surface used by integration and E2E harnesses.
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from backend.auth.dependencies import get_current_user
from backend.config import settings
from backend.db.runtime import get_db
from backend.services.runtime import get_cache_service

router = APIRouter(prefix="/api/test-support", tags=["test-support"])

TEST_SUPPORT_HEADER = "x-stock-verify-test-support"
TEST_SUPPORT_HEADER_VALUE = "enabled"
SYNTHETIC_ITEM_PREFIX = "E2E_"
SYNTHETIC_SESSION_MARKER_PREFIX = "E2E-"
SYNTHETIC_WAREHOUSE_PREFIX = "e2e-"
TEST_SUPPORT_ALLOWED_ENVIRONMENTS = {"development", "test"}
TEST_RUN_ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9_-]{7,119}$"
FIXTURE_SOURCE = "playwright-business-e2e"
LOCAL_HOSTS = {"127.0.0.1", "::1", "localhost", "test", "testclient", "testserver"}
GOVERNED_MUTATION_COLLECTIONS = {
    "count_lines",
    "sessions",
    "verification_sessions",
    "recount_requests",
    "session_snapshots",
    "unknown_items",
}


class ScopedTestSupportRequest(BaseModel):
    test_run_id: str = Field(min_length=8, max_length=120, pattern=TEST_RUN_ID_PATTERN)


class SyntheticErpItemRequest(ScopedTestSupportRequest):
    item_code: str
    barcode: str = Field(pattern=r"^(51|52|53)\d{4}$")
    item_name: str
    stock_qty: float
    mrp: float = 1.0
    category: str = "E2E"
    subcategory: str = "Business"
    warehouse: str = SYNTHETIC_WAREHOUSE_PREFIX + "main"
    floor: str = "E2E-F1"
    rack: str = "E2E-R1"
    sales_price: float | None = None
    uom_name: str = "PCS"
    manual_barcode: str | None = None


class SyntheticErpItemPatchRequest(ScopedTestSupportRequest):
    item_name: str | None = None
    stock_qty: float | None = None
    mrp: float | None = None
    category: str | None = None
    subcategory: str | None = None
    warehouse: str | None = None
    floor: str | None = None
    rack: str | None = None
    sales_price: float | None = None
    manual_barcode: str | None = None


class SyntheticVarianceRequest(ScopedTestSupportRequest):
    item_code: str
    item_name: str
    system_qty: float
    verified_qty: float
    variance: float | None = None
    verified_by: str = "supervisor"
    category: str = "E2E"
    subcategory: str = "Business"
    floor: str = "E2E-F1"
    rack: str = "E2E-R1"
    warehouse: str = SYNTHETIC_WAREHOUSE_PREFIX + "main"
    session_id: str = "e2e-session"
    count_line_id: str | None = None
    verified_at: datetime | None = None


class SyntheticCleanupRequest(ScopedTestSupportRequest):
    item_codes: list[str] = Field(default_factory=list)
    barcodes: list[str] = Field(default_factory=list)
    session_ids: list[str] = Field(default_factory=list)
    count_line_ids: list[str] = Field(default_factory=list)
    warehouse_fragments: list[str] = Field(default_factory=list)


class SyntheticInspectRequest(SyntheticCleanupRequest):
    max_records: int = Field(default=25, ge=1, le=200)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _serialize_document(document: dict[str, Any] | None) -> dict[str, Any] | None:
    if not document:
        return None

    serialized = dict(document)
    if "_id" in serialized:
        serialized["_id"] = str(serialized["_id"])

    for key, value in list(serialized.items()):
        if isinstance(value, datetime):
            serialized[key] = value.isoformat()

    return serialized


def _serialize_documents(documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        serialized
        for serialized in (_serialize_document(document) for document in documents)
        if serialized
    ]


def _require_synthetic_item_code(item_code: str) -> str:
    normalized = (item_code or "").strip().upper()
    if not normalized.startswith(SYNTHETIC_ITEM_PREFIX):
        raise HTTPException(
            status_code=400,
            detail=f"item_code must start with {SYNTHETIC_ITEM_PREFIX}",
        )
    return normalized


def _require_synthetic_warehouse(warehouse: str) -> str:
    normalized = (warehouse or "").strip()
    if not normalized.lower().startswith(SYNTHETIC_WAREHOUSE_PREFIX):
        raise HTTPException(
            status_code=400,
            detail=f"warehouse must start with {SYNTHETIC_WAREHOUSE_PREFIX}",
        )
    return normalized


def _require_synthetic_session_marker(value: str) -> str:
    normalized = (value or "").strip().upper()
    if not normalized.startswith(SYNTHETIC_SESSION_MARKER_PREFIX):
        raise HTTPException(
            status_code=400,
            detail=f"marker must start with {SYNTHETIC_SESSION_MARKER_PREFIX}",
        )
    return normalized


def _normalize_list(values: list[str]) -> list[str]:
    return [value.strip() for value in values if value and value.strip()]


def _normalize_test_run_id(test_run_id: str) -> str:
    return str(test_run_id or "").strip()


def _build_or_query(filters: list[dict[str, Any]]) -> dict[str, Any]:
    normalized_filters = [filter_query for filter_query in filters if filter_query]
    if not normalized_filters:
        return {}
    if len(normalized_filters) == 1:
        return normalized_filters[0]
    return {"$or": normalized_filters}


def _with_test_run_scope(test_run_id: str, query: dict[str, Any]) -> dict[str, Any]:
    scoped_query = {"test_run_id": test_run_id}
    if not query:
        return scoped_query
    return {"$or": [scoped_query, query]}


def _is_governed_mutation_collection(collection_name: str) -> bool:
    return collection_name in GOVERNED_MUTATION_COLLECTIONS


def _request_is_local(request: Request) -> bool:
    hosts = {
        str(host or "").strip().lower()
        for host in [
            request.client.host if request.client else None,
            request.url.hostname,
        ]
        if str(host or "").strip()
    }
    return any(host in LOCAL_HOSTS for host in hosts)


def _test_support_enabled_for_request(request: Request) -> bool:
    environment = (
        "test"
        if os.getenv("TESTING", "false").lower() == "true"
        else str(getattr(settings, "ENVIRONMENT", "development")).strip().lower()
    )
    return environment in TEST_SUPPORT_ALLOWED_ENVIRONMENTS and _request_is_local(request)


def _assert_test_support_access(request: Request, current_user: dict[str, Any]) -> None:
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    if request.headers.get(TEST_SUPPORT_HEADER) != TEST_SUPPORT_HEADER_VALUE:
        raise HTTPException(status_code=403, detail="Missing test-support header")

    if not _test_support_enabled_for_request(request):
        raise HTTPException(status_code=403, detail="Test-support routes are disabled")


async def _invalidate_fixture_item_cache(
    *,
    barcode: str | None,
    item_code: str | None,
    manual_barcode: str | None = None,
) -> None:
    try:
        cache = get_cache_service()
    except RuntimeError:
        return

    keys = {
        value.strip()
        for value in [barcode, item_code, manual_barcode]
        if isinstance(value, str) and value.strip()
    }
    for key in keys:
        await cache.delete("items", key)
        await cache.delete("items", f"enhanced_{key}")
    await cache.clear_pattern("search:*")


async def _resolve_session_ids(
    db: Any,
    *,
    explicit_session_ids: list[str],
    warehouse_fragments: list[str],
) -> list[str]:
    session_ids = set(explicit_session_ids)
    warehouse_query = _build_or_query(
        [
            {field_name: {"$regex": re.escape(fragment), "$options": "i"}}
            for fragment in warehouse_fragments
            for field_name in ("warehouse", "rack_no", "location_name")
        ]
    )
    if not warehouse_query:
        return sorted(session_ids)

    async for session in db.sessions.find(warehouse_query, {"id": 1, "session_id": 1}):
        if session.get("id"):
            session_ids.add(str(session["id"]))
        if session.get("session_id"):
            session_ids.add(str(session["session_id"]))

    return sorted(session_ids)


async def _resolve_count_line_ids(
    db: Any,
    *,
    explicit_count_line_ids: list[str],
    item_codes: list[str],
    barcodes: list[str],
    session_ids: list[str],
) -> list[str]:
    count_line_ids = set(explicit_count_line_ids)
    count_line_query = _build_or_query(
        [
            {"id": {"$in": explicit_count_line_ids}} if explicit_count_line_ids else {},
            {"item_code": {"$in": item_codes}} if item_codes else {},
            {"barcode": {"$in": barcodes}} if barcodes else {},
            {"session_id": {"$in": session_ids}} if session_ids else {},
        ]
    )
    if not count_line_query:
        return sorted(count_line_ids)

    async for line in db.count_lines.find(count_line_query, {"id": 1}):
        if line.get("id"):
            count_line_ids.add(str(line["id"]))

    return sorted(count_line_ids)


def _build_collection_queries(
    *,
    item_codes: list[str],
    barcodes: list[str],
    session_ids: list[str],
    count_line_ids: list[str],
    warehouse_fragments: list[str],
) -> dict[str, dict[str, Any]]:
    session_filters: list[dict[str, Any]] = []
    if session_ids:
        session_filters.append({"id": {"$in": session_ids}})
        session_filters.append({"session_id": {"$in": session_ids}})
    session_filters.extend(
        {field_name: {"$regex": re.escape(fragment), "$options": "i"}}
        for fragment in warehouse_fragments
        for field_name in ("warehouse", "rack_no", "location_name")
    )

    count_line_filters: list[dict[str, Any]] = []
    if count_line_ids:
        count_line_filters.append({"id": {"$in": count_line_ids}})
    if item_codes:
        count_line_filters.append({"item_code": {"$in": item_codes}})
    if barcodes:
        count_line_filters.append({"barcode": {"$in": barcodes}})
    if session_ids:
        count_line_filters.append({"session_id": {"$in": session_ids}})

    item_filters: list[dict[str, Any]] = []
    if item_codes:
        item_filters.append({"item_code": {"$in": item_codes}})
    if barcodes:
        item_filters.append({"barcode": {"$in": barcodes}})

    variance_filters: list[dict[str, Any]] = []
    if item_codes:
        variance_filters.append({"item_code": {"$in": item_codes}})
    if count_line_ids:
        variance_filters.append({"count_line_id": {"$in": count_line_ids}})
    if session_ids:
        variance_filters.append({"session_id": {"$in": session_ids}})

    snapshot_filters: list[dict[str, Any]] = []
    if item_codes:
        snapshot_filters.append({"item_code": {"$in": item_codes}})
    if barcodes:
        snapshot_filters.append({"barcode": {"$in": barcodes}})
    if session_ids:
        snapshot_filters.append({"session_id": {"$in": session_ids}})

    recount_filters = []
    if count_line_ids:
        recount_filters.append({"count_line_id": {"$in": count_line_ids}})
    if item_codes:
        recount_filters.append({"item_code": {"$in": item_codes}})
    if barcodes:
        recount_filters.append({"barcode": {"$in": barcodes}})
    if session_ids:
        recount_filters.append({"session_id": {"$in": session_ids}})

    notification_filters = []
    if count_line_ids:
        notification_filters.append({"count_line_id": {"$in": count_line_ids}})
    if item_codes:
        notification_filters.append({"item_code": {"$in": item_codes}})
    if barcodes:
        notification_filters.append({"barcode": {"$in": barcodes}})
    if session_ids:
        notification_filters.append({"session_id": {"$in": session_ids}})

    return {
        "notifications": _build_or_query(notification_filters),
        "recount_requests": _build_or_query(recount_filters),
        "stock_snapshots": _build_or_query(snapshot_filters),
        "session_snapshots": _build_or_query(snapshot_filters),
        "verification_logs": _build_or_query(variance_filters),
        "item_variances": _build_or_query(variance_filters),
        "count_lines": _build_or_query(count_line_filters),
        "verification_sessions": {"session_id": {"$in": session_ids}} if session_ids else {},
        "sessions": _build_or_query(session_filters),
        "erp_items": _build_or_query(item_filters),
    }


async def _resolve_fixture_scope_context(
    db: Any, payload: SyntheticCleanupRequest
) -> dict[str, Any]:
    test_run_id = _normalize_test_run_id(payload.test_run_id)
    item_codes = [
        _require_synthetic_item_code(code) for code in _normalize_list(payload.item_codes)
    ]
    barcodes = _normalize_list(payload.barcodes)
    warehouse_fragments = [
        _require_synthetic_session_marker(marker)
        for marker in _normalize_list(payload.warehouse_fragments)
    ]
    explicit_session_ids = _normalize_list(payload.session_ids)
    explicit_count_line_ids = _normalize_list(payload.count_line_ids)

    session_ids = await _resolve_session_ids(
        db,
        explicit_session_ids=explicit_session_ids,
        warehouse_fragments=warehouse_fragments,
    )
    count_line_ids = await _resolve_count_line_ids(
        db,
        explicit_count_line_ids=explicit_count_line_ids,
        item_codes=item_codes,
        barcodes=barcodes,
        session_ids=session_ids,
    )
    collection_queries = _build_collection_queries(
        item_codes=item_codes,
        barcodes=barcodes,
        session_ids=session_ids,
        count_line_ids=count_line_ids,
        warehouse_fragments=warehouse_fragments,
    )

    return {
        "test_run_id": test_run_id,
        "item_codes": item_codes,
        "barcodes": barcodes,
        "session_ids": session_ids,
        "count_line_ids": count_line_ids,
        "collection_queries": collection_queries,
    }


def _fixture_scope_metadata(current_user: dict[str, Any], test_run_id: str) -> dict[str, Any]:
    return {
        "test_run_id": test_run_id,
        "is_test_fixture": True,
        "fixture_source": FIXTURE_SOURCE,
        "updated_at": _utc_now(),
        "updated_by": current_user.get("username"),
    }


async def _apply_runtime_scope(
    db: Any,
    *,
    current_user: dict[str, Any],
    test_run_id: str,
    collection_queries: dict[str, dict[str, Any]],
) -> tuple[dict[str, int], list[str]]:
    scoped_counts: dict[str, int] = {}
    blocked_collections: list[str] = []
    metadata = _fixture_scope_metadata(current_user, test_run_id)

    for collection_name, query in collection_queries.items():
        if _is_governed_mutation_collection(collection_name):
            scoped_counts[collection_name] = 0
            blocked_collections.append(collection_name)
            continue
        if not query:
            scoped_counts[collection_name] = 0
            continue
        result = await db[collection_name].update_many(query, {"$set": metadata})
        scoped_counts[collection_name] = int(getattr(result, "modified_count", 0))

    return scoped_counts, blocked_collections


async def _fetch_collection_documents(
    db: Any,
    collection_name: str,
    query: dict[str, Any],
    *,
    sort_field: str | None = None,
    limit: int = 25,
) -> list[dict[str, Any]]:
    if not query:
        return []

    cursor = db[collection_name].find(query)
    if sort_field:
        cursor = cursor.sort(sort_field, -1)
    return await cursor.limit(limit).to_list(length=limit)


@router.post("/erp-items")
async def upsert_synthetic_erp_item(
    payload: SyntheticErpItemRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    _assert_test_support_access(request, current_user)

    item_code = _require_synthetic_item_code(payload.item_code)
    warehouse = _require_synthetic_warehouse(payload.warehouse)
    test_run_id = _normalize_test_run_id(payload.test_run_id)
    now = _utc_now()

    document = {
        "item_code": item_code,
        "barcode": payload.barcode,
        "item_name": payload.item_name,
        "stock_qty": float(payload.stock_qty),
        "mrp": float(payload.mrp),
        "category": payload.category,
        "subcategory": payload.subcategory,
        "warehouse": warehouse,
        "floor": payload.floor,
        "rack": payload.rack,
        "uom_name": payload.uom_name,
        "sales_price": (
            float(payload.sales_price) if payload.sales_price is not None else payload.mrp
        ),
        "manual_barcode": payload.manual_barcode,
        "verified": False,
        "verified_qty": None,
        "variance": None,
        "test_run_id": test_run_id,
        "synced_at": now,
        "updated_at": now,
        "updated_by": current_user.get("username"),
        "is_test_fixture": True,
        "fixture_source": FIXTURE_SOURCE,
    }

    await db.erp_items.update_one(
        {"item_code": item_code},
        {
            "$set": document,
            "$setOnInsert": {
                "created_at": now,
                "created_by": current_user.get("username"),
                "synced_from_erp": False,
            },
        },
        upsert=True,
    )

    await _invalidate_fixture_item_cache(
        barcode=payload.barcode,
        item_code=item_code,
        manual_barcode=payload.manual_barcode,
    )

    saved = await db.erp_items.find_one({"item_code": item_code})
    return {"success": True, "item": _serialize_document(saved)}


@router.patch("/erp-items/{item_code}")
async def patch_synthetic_erp_item(
    item_code: str,
    payload: SyntheticErpItemPatchRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    _assert_test_support_access(request, current_user)

    normalized_item_code = _require_synthetic_item_code(item_code)
    test_run_id = _normalize_test_run_id(payload.test_run_id)
    existing = await db.erp_items.find_one({"item_code": normalized_item_code})
    if not existing:
        raise HTTPException(status_code=404, detail="Synthetic ERP item not found")
    if str(existing.get("test_run_id") or "") != test_run_id:
        raise HTTPException(
            status_code=409, detail="Synthetic ERP item belongs to a different test run"
        )

    update_data = payload.model_dump(exclude_unset=True)
    update_data.pop("test_run_id", None)
    if "warehouse" in update_data and update_data["warehouse"] is not None:
        update_data["warehouse"] = _require_synthetic_warehouse(str(update_data["warehouse"]))
    if "item_code" in update_data:
        update_data.pop("item_code", None)
    if "stock_qty" in update_data and update_data["stock_qty"] is not None:
        update_data["stock_qty"] = float(update_data["stock_qty"])
    if "mrp" in update_data and update_data["mrp"] is not None:
        update_data["mrp"] = float(update_data["mrp"])
    if "sales_price" in update_data and update_data["sales_price"] is not None:
        update_data["sales_price"] = float(update_data["sales_price"])

    update_data["updated_at"] = _utc_now()
    update_data["updated_by"] = current_user.get("username")

    await db.erp_items.update_one({"item_code": normalized_item_code}, {"$set": update_data})

    await _invalidate_fixture_item_cache(
        barcode=existing.get("barcode"),
        item_code=normalized_item_code,
        manual_barcode=update_data.get("manual_barcode") or existing.get("manual_barcode"),
    )

    saved = await db.erp_items.find_one({"item_code": normalized_item_code})
    return {"success": True, "item": _serialize_document(saved)}


@router.post("/item-variances")
async def create_synthetic_item_variance(
    payload: SyntheticVarianceRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    _assert_test_support_access(request, current_user)

    item_code = _require_synthetic_item_code(payload.item_code)
    warehouse = _require_synthetic_warehouse(payload.warehouse)
    test_run_id = _normalize_test_run_id(payload.test_run_id)
    verified_at = payload.verified_at or _utc_now()
    variance = (
        float(payload.variance)
        if payload.variance is not None
        else float(payload.verified_qty) - float(payload.system_qty)
    )

    variance_doc = {
        "item_code": item_code,
        "item_name": payload.item_name,
        "system_qty": float(payload.system_qty),
        "verified_qty": float(payload.verified_qty),
        "variance": variance,
        "verified_by": payload.verified_by,
        "verified_at": verified_at,
        "category": payload.category,
        "subcategory": payload.subcategory,
        "floor": payload.floor,
        "rack": payload.rack,
        "warehouse": warehouse,
        "session_id": payload.session_id,
        "count_line_id": payload.count_line_id or f"{item_code}-variance",
        "test_run_id": test_run_id,
        "is_test_fixture": True,
        "fixture_source": FIXTURE_SOURCE,
        "created_by": current_user.get("username"),
        "created_at": _utc_now(),
    }

    filter_query = {
        "item_code": item_code,
        "session_id": payload.session_id,
        "count_line_id": variance_doc["count_line_id"],
    }
    await db.item_variances.delete_many(filter_query)
    await db.verification_logs.delete_many(filter_query)
    await db.item_variances.insert_one(dict(variance_doc))
    await db.verification_logs.insert_one(dict(variance_doc))

    return {"success": True, "variance": _serialize_document(variance_doc)}


@router.post("/cleanup")
async def cleanup_synthetic_fixtures(
    payload: SyntheticCleanupRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    _assert_test_support_access(request, current_user)

    scope_context = await _resolve_fixture_scope_context(db, payload)
    test_run_id = scope_context["test_run_id"]
    item_codes = scope_context["item_codes"]
    barcodes = scope_context["barcodes"]
    session_ids = scope_context["session_ids"]
    count_line_ids = scope_context["count_line_ids"]
    collection_queries = scope_context["collection_queries"]

    scoped, blocked_collections = await _apply_runtime_scope(
        db,
        current_user=current_user,
        test_run_id=test_run_id,
        collection_queries=collection_queries,
    )

    deleted: dict[str, int] = {}
    for collection_name, query in collection_queries.items():
        if _is_governed_mutation_collection(collection_name):
            deleted[collection_name] = 0
            continue
        scoped_query = _with_test_run_scope(test_run_id, query)
        if not scoped_query:
            deleted[collection_name] = 0
            continue
        result = await db[collection_name].delete_many(scoped_query)
        deleted[collection_name] = int(getattr(result, "deleted_count", 0))

    for item_code in item_codes:
        await _invalidate_fixture_item_cache(barcode=None, item_code=item_code)
    for barcode in barcodes:
        await _invalidate_fixture_item_cache(barcode=barcode, item_code=None)

    return {
        "success": True,
        "test_run_id": test_run_id,
        "deleted": deleted,
        "scoped": scoped,
        "blocked_collections": sorted(set(blocked_collections)),
        "session_ids": session_ids,
        "count_line_ids": count_line_ids,
    }


@router.post("/scope-runtime")
async def scope_runtime_fixtures(
    payload: SyntheticCleanupRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    _assert_test_support_access(request, current_user)

    scope_context = await _resolve_fixture_scope_context(db, payload)
    test_run_id = scope_context["test_run_id"]
    session_ids = scope_context["session_ids"]
    count_line_ids = scope_context["count_line_ids"]
    collection_queries = scope_context["collection_queries"]
    scoped, blocked_collections = await _apply_runtime_scope(
        db,
        current_user=current_user,
        test_run_id=test_run_id,
        collection_queries=collection_queries,
    )

    return {
        "success": True,
        "test_run_id": test_run_id,
        "scoped": scoped,
        "blocked_collections": sorted(set(blocked_collections)),
        "session_ids": session_ids,
        "count_line_ids": count_line_ids,
    }


@router.post("/inspect")
async def inspect_synthetic_fixtures(
    payload: SyntheticInspectRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    _assert_test_support_access(request, current_user)

    scope_context = await _resolve_fixture_scope_context(db, payload)
    test_run_id = scope_context["test_run_id"]
    session_ids = scope_context["session_ids"]
    count_line_ids = scope_context["count_line_ids"]
    collection_queries = scope_context["collection_queries"]
    max_records = payload.max_records

    sessions = await _fetch_collection_documents(
        db,
        "sessions",
        _with_test_run_scope(test_run_id, collection_queries["sessions"]),
        sort_field="started_at",
        limit=max_records,
    )
    erp_items = await _fetch_collection_documents(
        db,
        "erp_items",
        _with_test_run_scope(test_run_id, collection_queries["erp_items"]),
        sort_field="updated_at",
        limit=max_records,
    )
    count_lines = await _fetch_collection_documents(
        db,
        "count_lines",
        _with_test_run_scope(test_run_id, collection_queries["count_lines"]),
        sort_field="counted_at",
        limit=max_records,
    )
    item_variances = await _fetch_collection_documents(
        db,
        "item_variances",
        _with_test_run_scope(test_run_id, collection_queries["item_variances"]),
        sort_field="verified_at",
        limit=max_records,
    )
    verification_logs = await _fetch_collection_documents(
        db,
        "verification_logs",
        _with_test_run_scope(test_run_id, collection_queries["verification_logs"]),
        sort_field="verified_at",
        limit=max_records,
    )
    notifications = await _fetch_collection_documents(
        db,
        "notifications",
        _with_test_run_scope(test_run_id, collection_queries["notifications"]),
        sort_field="created_at",
        limit=max_records,
    )
    recount_requests = await _fetch_collection_documents(
        db,
        "recount_requests",
        _with_test_run_scope(test_run_id, collection_queries["recount_requests"]),
        sort_field="created_at",
        limit=max_records,
    )
    session_snapshots = await _fetch_collection_documents(
        db,
        "session_snapshots",
        _with_test_run_scope(test_run_id, collection_queries["session_snapshots"]),
        sort_field="created_at",
        limit=max_records,
    )
    stock_snapshots = await _fetch_collection_documents(
        db,
        "stock_snapshots",
        _with_test_run_scope(test_run_id, collection_queries["stock_snapshots"]),
        sort_field="created_at",
        limit=max_records,
    )

    return {
        "success": True,
        "test_run_id": test_run_id,
        "session_ids": session_ids,
        "count_line_ids": count_line_ids,
        "state": {
            "sessions": _serialize_documents(sessions),
            "latest_session": _serialize_document(sessions[0]) if sessions else None,
            "erp_items": _serialize_documents(erp_items),
            "primary_erp_item": _serialize_document(erp_items[0]) if erp_items else None,
            "count_lines": _serialize_documents(count_lines),
            "latest_count_line": _serialize_document(count_lines[0]) if count_lines else None,
            "item_variances": _serialize_documents(item_variances),
            "latest_variance": _serialize_document(item_variances[0]) if item_variances else None,
            "verification_logs": _serialize_documents(verification_logs),
            "notifications": _serialize_documents(notifications),
            "recount_requests": _serialize_documents(recount_requests),
            "session_snapshots": _serialize_documents(session_snapshots),
            "stock_snapshots": _serialize_documents(stock_snapshots),
        },
    }
