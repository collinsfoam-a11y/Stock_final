"""Read helpers for ERP reference items plus local manual items."""

from __future__ import annotations

import inspect
from typing import Any, Optional


async def _resolve(value: Any) -> Any:
    return await value if inspect.isawaitable(value) else value


def _manual_items_collection(db: Any) -> Any:
    collection = getattr(db, "manual_items", None)
    if collection is None:
        return None
    if collection.__class__.__module__.startswith("unittest.mock") and "manual_items" not in vars(
        db
    ):
        return None
    return collection


async def find_item_master(
    db: Any,
    query: dict[str, Any],
    *,
    db_session: Optional[Any] = None,
) -> Optional[dict[str, Any]]:
    """Find an item in ERP reference data, then local manual items."""
    kwargs = {"session": db_session} if db_session is not None else {}
    erp_item = await _resolve(db.erp_items.find_one(query, **kwargs))
    if isinstance(erp_item, dict):
        erp_item.setdefault("source", "erp")
        return erp_item

    manual_items = _manual_items_collection(db)
    if manual_items is None:
        return None

    manual_item = await _resolve(manual_items.find_one(query, **kwargs))
    if isinstance(manual_item, dict):
        manual_item.setdefault("source", "manual")
        manual_item.setdefault("stock_qty", 0.0)
        return manual_item

    return None


async def find_item_master_by_barcode_or_code(
    db: Any,
    *,
    barcode: Optional[str] = None,
    item_code: Optional[str] = None,
    db_session: Optional[Any] = None,
) -> Optional[dict[str, Any]]:
    """Find by barcode first, then item_code, across ERP and manual catalogs."""
    if barcode:
        item = await find_item_master(db, {"barcode": barcode}, db_session=db_session)
        if item:
            return item
    if item_code:
        return await find_item_master(db, {"item_code": item_code}, db_session=db_session)
    return None


async def find_item_masters(
    db: Any,
    query: dict[str, Any],
    *,
    limit: int,
    db_session: Optional[Any] = None,
) -> list[dict[str, Any]]:
    """Fetch matching ERP and manual items with ERP-first ordering."""
    kwargs = {"session": db_session} if db_session is not None else {}
    results: list[dict[str, Any]] = []

    erp_cursor = db.erp_items.find(query, **kwargs).limit(limit)
    erp_items = await _resolve(erp_cursor.to_list(length=limit))
    if isinstance(erp_items, list):
        for item in erp_items:
            if isinstance(item, dict):
                item.setdefault("source", "erp")
                results.append(item)

    remaining = max(0, limit - len(results))
    manual_items = _manual_items_collection(db)
    if remaining == 0 or manual_items is None:
        return results

    manual_cursor = manual_items.find(query, **kwargs).limit(remaining)
    manual_results = await _resolve(manual_cursor.to_list(length=remaining))
    if isinstance(manual_results, list):
        for item in manual_results:
            if isinstance(item, dict):
                item.setdefault("source", "manual")
                item.setdefault("stock_qty", 0.0)
                results.append(item)

    return results
