"""
Dashboard Analytics API - Real-time monitoring with quantity and value tracking

Provides comprehensive dashboard KPIs for admin/supervisor monitoring:
- Quantity-based progress (units counted / total units)
- Value-based progress (₹ counted / ₹ total)
- Breakdowns by location, category, session, date
- Drill-down to item/batch/serial level
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from backend.auth.permissions import Permission, require_permission
from backend.db.runtime import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/analytics/dashboard", tags=["Dashboard Analytics"])


# Response Models


class QuantityStatus(BaseModel):
    """Quantity-based progress metrics"""

    total_stock_qty: float = Field(..., description="Total stock quantity in ERP")
    total_counted_qty: float = Field(..., description="Total quantity counted")
    completion_percentage: float = Field(..., description="Percentage complete by quantity")
    items_counted: int = Field(..., description="Number of unique items counted")
    items_total: int = Field(..., description="Total number of items in ERP")
    variance_qty: float = Field(..., description="Total quantity variance")


class ValueStatus(BaseModel):
    """Value-based progress metrics in INR"""

    basis: str = Field(..., description="Valuation basis: 'last_cost' or 'sale_price'")
    currency: str = Field(default="INR", description="Currency code")
    total_stock_value: float = Field(..., description="Total stock value in INR")
    total_counted_value: float = Field(..., description="Total counted value in INR")
    completion_percentage: float = Field(..., description="Percentage complete by value")
    variance_value: float = Field(..., description="Total value variance in INR")


class DashboardOverview(BaseModel):
    """Complete dashboard overview"""

    quantity_status: QuantityStatus
    value_status: ValueStatus
    last_updated: datetime
    active_sessions: int
    total_users: int
    pending_approvals: int


class BreakdownItem(BaseModel):
    """Individual breakdown item"""

    label: str = Field(..., description="Group label (e.g., 'Showroom - First Floor')")
    quantity_status: QuantityStatus
    value_status: ValueStatus
    session_count: int
    last_activity: Optional[datetime] = None


class DashboardBreakdown(BaseModel):
    """Breakdown by specified grouping"""

    group_by: str = Field(..., description="Grouping type: location, category, session, date")
    items: List[BreakdownItem]
    total_groups: int


class DrilldownItem(BaseModel):
    """Item-level detail for drill-down"""

    item_code: str
    item_name: str
    category: Optional[str] = None
    expected_qty: float
    counted_qty: float
    variance_qty: float
    expected_value: float
    counted_value: float
    variance_value: float
    status: str  # pending, approved, rejected
    last_counted: Optional[datetime] = None


# Helper Functions


async def calculate_dashboard_overview(
    db: AsyncIOMotorDatabase, valuation_basis: str = "last_cost"
) -> DashboardOverview:
    """
    Calculate complete dashboard overview with quantity and value metrics.

    Args:
        db: Database instance
        valuation_basis: 'last_cost' or 'sale_price'

    Returns:
        DashboardOverview with all KPIs
    """
    # Get all items from ERP
    all_items_cursor = db.erp_items.find({})
    all_items = await all_items_cursor.to_list(None)

    # Get all count lines from active sessions
    active_sessions_cursor = db.sessions.find({"status": {"$in": ["OPEN", "ACTIVE"]}})
    active_sessions = await active_sessions_cursor.to_list(None)
    session_ids = [s.get("id") for s in active_sessions]

    count_lines_cursor = db.count_lines.find({"session_id": {"$in": session_ids}})
    count_lines = await count_lines_cursor.to_list(None)

    # Calculate quantity metrics
    total_stock_qty = sum(item.get("stock_qty", 0) for item in all_items)
    total_counted_qty = sum(line.get("counted_qty", 0) for line in count_lines)
    variance_qty = total_counted_qty - total_stock_qty

    qty_completion = (total_counted_qty / total_stock_qty * 100) if total_stock_qty > 0 else 0

    # Get unique items counted
    items_counted = len(set(line.get("item_code") for line in count_lines))
    items_total = len(all_items)

    # Calculate value metrics
    price_field = valuation_basis if valuation_basis in ["last_cost", "sale_price"] else "last_cost"

    # Build item price map
    item_price_map = {}
    for item in all_items:
        price = item.get(price_field, 0) or item.get("sale_price", 0) or item.get("mrp", 0)
        item_price_map[item["item_code"]] = price

    # Calculate total stock value
    total_stock_value = sum(
        item.get("stock_qty", 0) * item_price_map.get(item["item_code"], 0) for item in all_items
    )

    # Calculate total counted value
    total_counted_value = sum(
        line.get("counted_qty", 0) * item_price_map.get(line.get("item_code"), 0)
        for line in count_lines
    )

    variance_value = total_counted_value - total_stock_value
    value_completion = (
        (total_counted_value / total_stock_value * 100) if total_stock_value > 0 else 0
    )

    # Get pending approvals count
    pending_approvals = await db.count_lines.count_documents(
        {"status": {"$in": ["pending_approval", "NEEDS_REVIEW"]}}
    )

    # Get total users
    total_users = await db.users.count_documents({})

    return DashboardOverview(
        quantity_status=QuantityStatus(
            total_stock_qty=round(total_stock_qty, 2),
            total_counted_qty=round(total_counted_qty, 2),
            completion_percentage=round(qty_completion, 2),
            items_counted=items_counted,
            items_total=items_total,
            variance_qty=round(variance_qty, 2),
        ),
        value_status=ValueStatus(
            basis=valuation_basis,
            currency="INR",
            total_stock_value=round(total_stock_value, 2),
            total_counted_value=round(total_counted_value, 2),
            completion_percentage=round(value_completion, 2),
            variance_value=round(variance_value, 2),
        ),
        last_updated=datetime.now(timezone.utc).replace(tzinfo=None),
        active_sessions=len(active_sessions),
        total_users=total_users,
        pending_approvals=pending_approvals,
    )


# API Endpoints


@router.get("/overview", response_model=DashboardOverview)
async def get_dashboard_overview(
    valuation_basis: str = Query(
        "last_cost", description="Valuation basis: 'last_cost' or 'sale_price'"
    ),
    current_user: dict = require_permission(Permission.REPORT_ANALYTICS),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Get dashboard overview with quantity and value KPIs.

    Requires: Supervisor or Admin role

    Returns:
    - Quantity progress (units counted / total units)
    - Value progress (₹ counted / ₹ total)
    - Active sessions count
    - Pending approvals count
    """
    try:
        overview = await calculate_dashboard_overview(db, valuation_basis)

        logger.info(
            f"Dashboard overview requested by {current_user.get('username')}: "
            f"qty={overview.quantity_status.completion_percentage}%, "
            f"value={overview.value_status.completion_percentage}%"
        )

        return overview

    except Exception as e:
        logger.error(f"Error calculating dashboard overview: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/breakdown", response_model=DashboardBreakdown)
async def get_dashboard_breakdown(
    group_by: str = Query(..., description="Group by: location, category, session, date"),
    valuation_basis: str = Query("last_cost", description="Valuation basis"),
    current_user: dict = require_permission(Permission.REPORT_ANALYTICS),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Get dashboard breakdown by specified grouping.

    Grouping options:
    - location: By floor/rack location
    - category: By item category
    - session: By individual sessions
    - date: By date (last 7 days)
    """
    try:
        if group_by not in ["location", "category", "session", "date"]:
            raise HTTPException(
                status_code=400,
                detail="Invalid group_by. Must be: location, category, session, or date",
            )

        breakdown_items = []

        if group_by == "location":
            breakdown_items = await _breakdown_by_location(db, valuation_basis)
        elif group_by == "category":
            breakdown_items = await _breakdown_by_category(db, valuation_basis)
        elif group_by == "session":
            breakdown_items = await _breakdown_by_session(db, valuation_basis)
        elif group_by == "date":
            breakdown_items = await _breakdown_by_date(db, valuation_basis)

        return DashboardBreakdown(
            group_by=group_by,
            items=breakdown_items,
            total_groups=len(breakdown_items),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating breakdown: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _breakdown_by_location(
    db: AsyncIOMotorDatabase, valuation_basis: str
) -> List[BreakdownItem]:
    """Breakdown by floor/rack location"""
    # Group count lines by floor_no
    pipeline: List[Dict[str, Any]] = [
        {"$match": {"floor_no": {"$exists": True, "$ne": None}}},
        {"$group": {"_id": "$floor_no", "count_lines": {"$push": "$$ROOT"}}},
    ]

    groups = await db.count_lines.aggregate(pipeline).to_list(None)

    breakdown = []
    for group in groups:
        floor = group["_id"]
        lines = group["count_lines"]

        # Calculate metrics for this location
        total_counted = sum(line.get("counted_qty", 0) for line in lines)
        total_expected = sum(line.get("erp_qty", 0) for line in lines)

        # Get item prices
        item_codes = [line.get("item_code") for line in lines]
        items = await db.erp_items.find({"item_code": {"$in": item_codes}}).to_list(None)
        price_map = {
            item["item_code"]: item.get(valuation_basis, 0) or item.get("mrp", 0) for item in items
        }

        total_counted_value = sum(
            line.get("counted_qty", 0) * price_map.get(line.get("item_code"), 0) for line in lines
        )
        total_expected_value = sum(
            line.get("erp_qty", 0) * price_map.get(line.get("item_code"), 0) for line in lines
        )

        # Get session count for this location
        session_ids = set(line.get("session_id") for line in lines)

        # Get last activity
        last_activity = max(
            (line.get("counted_at") for line in lines if line.get("counted_at")), default=None
        )

        breakdown.append(
            BreakdownItem(
                label=f"Floor {floor}",
                quantity_status=QuantityStatus(
                    total_stock_qty=total_expected,
                    total_counted_qty=total_counted,
                    completion_percentage=round(
                        (total_counted / total_expected * 100) if total_expected > 0 else 0, 2
                    ),
                    items_counted=len(set(line.get("item_code") for line in lines)),
                    items_total=len(items),
                    variance_qty=round(total_counted - total_expected, 2),
                ),
                value_status=ValueStatus(
                    basis=valuation_basis,
                    currency="INR",
                    total_stock_value=round(total_expected_value, 2),
                    total_counted_value=round(total_counted_value, 2),
                    completion_percentage=round(
                        (
                            (total_counted_value / total_expected_value * 100)
                            if total_expected_value > 0
                            else 0
                        ),
                        2,
                    ),
                    variance_value=round(total_counted_value - total_expected_value, 2),
                ),
                session_count=len(session_ids),
                last_activity=last_activity,
            )
        )

    return breakdown


async def _breakdown_by_category(
    db: AsyncIOMotorDatabase, valuation_basis: str
) -> List[BreakdownItem]:
    """Breakdown by item category"""
    # Get all items with categories
    items_cursor = db.erp_items.find({"category": {"$exists": True, "$ne": None}})
    items = await items_cursor.to_list(None)

    # Group by category
    category_items: Dict[str, List[Dict[str, Any]]] = {}
    for item in items:
        cat = item.get("category", "Uncategorized")
        if cat not in category_items:
            category_items[cat] = []
        category_items[cat].append(item)

    breakdown = []
    for category, cat_items in category_items.items():
        item_codes = [item["item_code"] for item in cat_items]

        # Get count lines for these items
        count_lines = await db.count_lines.find({"item_code": {"$in": item_codes}}).to_list(None)

        # Calculate metrics (similar to location breakdown)
        total_counted = sum(line.get("counted_qty", 0) for line in count_lines)
        total_expected = sum(item.get("stock_qty", 0) for item in cat_items)

        price_map = {
            item["item_code"]: item.get(valuation_basis, 0) or item.get("mrp", 0)
            for item in cat_items
        }

        total_counted_value = sum(
            line.get("counted_qty", 0) * price_map.get(line.get("item_code"), 0)
            for line in count_lines
        )
        total_expected_value = sum(
            item.get("stock_qty", 0) * price_map.get(item["item_code"], 0) for item in cat_items
        )

        session_ids = set(line.get("session_id") for line in count_lines)
        last_activity = max(
            (line.get("counted_at") for line in count_lines if line.get("counted_at")), default=None
        )

        breakdown.append(
            BreakdownItem(
                label=category,
                quantity_status=QuantityStatus(
                    total_stock_qty=total_expected,
                    total_counted_qty=total_counted,
                    completion_percentage=round(
                        (total_counted / total_expected * 100) if total_expected > 0 else 0, 2
                    ),
                    items_counted=len(set(line.get("item_code") for line in count_lines)),
                    items_total=len(cat_items),
                    variance_qty=round(total_counted - total_expected, 2),
                ),
                value_status=ValueStatus(
                    basis=valuation_basis,
                    currency="INR",
                    total_stock_value=round(total_expected_value, 2),
                    total_counted_value=round(total_counted_value, 2),
                    completion_percentage=round(
                        (
                            (total_counted_value / total_expected_value * 100)
                            if total_expected_value > 0
                            else 0
                        ),
                        2,
                    ),
                    variance_value=round(total_counted_value - total_expected_value, 2),
                ),
                session_count=len(session_ids),
                last_activity=last_activity,
            )
        )

    return breakdown


async def _breakdown_by_session(
    db: AsyncIOMotorDatabase, valuation_basis: str
) -> List[BreakdownItem]:
    """Breakdown by individual sessions"""
    sessions = await db.sessions.find({"status": {"$in": ["OPEN", "ACTIVE", "CLOSED"]}}).to_list(
        None
    )

    breakdown = []
    for session in sessions[:20]:  # Limit to 20 most recent sessions
        session_id = session.get("id")
        count_lines = await db.count_lines.find({"session_id": session_id}).to_list(None)

        if not count_lines:
            continue

        # Calculate metrics
        total_counted = sum(line.get("counted_qty", 0) for line in count_lines)
        total_expected = sum(line.get("erp_qty", 0) for line in count_lines)

        # Get prices
        item_codes = [line.get("item_code") for line in count_lines]
        items = await db.erp_items.find({"item_code": {"$in": item_codes}}).to_list(None)
        price_map = {
            item["item_code"]: item.get(valuation_basis, 0) or item.get("mrp", 0) for item in items
        }

        total_counted_value = sum(
            line.get("counted_qty", 0) * price_map.get(line.get("item_code"), 0)
            for line in count_lines
        )
        total_expected_value = sum(
            line.get("erp_qty", 0) * price_map.get(line.get("item_code"), 0) for line in count_lines
        )

        label = f"{session.get('warehouse', 'Unknown')} - {session.get('staff_user', 'Unknown')}"

        breakdown.append(
            BreakdownItem(
                label=label,
                quantity_status=QuantityStatus(
                    total_stock_qty=total_expected,
                    total_counted_qty=total_counted,
                    completion_percentage=round(
                        (total_counted / total_expected * 100) if total_expected > 0 else 0, 2
                    ),
                    items_counted=len(set(line.get("item_code") for line in count_lines)),
                    items_total=len(items),
                    variance_qty=round(total_counted - total_expected, 2),
                ),
                value_status=ValueStatus(
                    basis=valuation_basis,
                    currency="INR",
                    total_stock_value=round(total_expected_value, 2),
                    total_counted_value=round(total_counted_value, 2),
                    completion_percentage=round(
                        (
                            (total_counted_value / total_expected_value * 100)
                            if total_expected_value > 0
                            else 0
                        ),
                        2,
                    ),
                    variance_value=round(total_counted_value - total_expected_value, 2),
                ),
                session_count=1,
                last_activity=session.get("started_at"),
            )
        )

    return breakdown


async def _breakdown_by_date(db: AsyncIOMotorDatabase, valuation_basis: str) -> List[BreakdownItem]:
    """Breakdown by date (last 7 days)"""
    breakdown = []

    for days_ago in range(7):
        date = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days_ago)
        start_of_day = date.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = date.replace(hour=23, minute=59, second=59, microsecond=999999)

        # Get count lines for this date
        count_lines = await db.count_lines.find(
            {"counted_at": {"$gte": start_of_day, "$lte": end_of_day}}
        ).to_list(None)

        if not count_lines:
            continue

        # Calculate metrics (similar pattern)
        total_counted = sum(line.get("counted_qty", 0) for line in count_lines)
        total_expected = sum(line.get("erp_qty", 0) for line in count_lines)

        item_codes = [line.get("item_code") for line in count_lines]
        items = await db.erp_items.find({"item_code": {"$in": item_codes}}).to_list(None)
        price_map = {
            item["item_code"]: item.get(valuation_basis, 0) or item.get("mrp", 0) for item in items
        }

        total_counted_value = sum(
            line.get("counted_qty", 0) * price_map.get(line.get("item_code"), 0)
            for line in count_lines
        )
        total_expected_value = sum(
            line.get("erp_qty", 0) * price_map.get(line.get("item_code"), 0) for line in count_lines
        )

        session_ids = set(line.get("session_id") for line in count_lines)

        breakdown.append(
            BreakdownItem(
                label=date.strftime("%Y-%m-%d"),
                quantity_status=QuantityStatus(
                    total_stock_qty=total_expected,
                    total_counted_qty=total_counted,
                    completion_percentage=round(
                        (total_counted / total_expected * 100) if total_expected > 0 else 0, 2
                    ),
                    items_counted=len(set(line.get("item_code") for line in count_lines)),
                    items_total=len(items),
                    variance_qty=round(total_counted - total_expected, 2),
                ),
                value_status=ValueStatus(
                    basis=valuation_basis,
                    currency="INR",
                    total_stock_value=round(total_expected_value, 2),
                    total_counted_value=round(total_counted_value, 2),
                    completion_percentage=round(
                        (
                            (total_counted_value / total_expected_value * 100)
                            if total_expected_value > 0
                            else 0
                        ),
                        2,
                    ),
                    variance_value=round(total_counted_value - total_expected_value, 2),
                ),
                session_count=len(session_ids),
                last_activity=end_of_day,
            )
        )

    return breakdown
