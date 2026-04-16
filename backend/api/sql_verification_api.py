"""
SQL Verification API Endpoints
Provides endpoints for verifying item quantities against SQL Server
"""

import logging
from typing import Dict, Any

from fastapi import APIRouter, HTTPException, Depends
from backend.services.sql_verification_service import sql_verification_service
from backend.auth.dependencies import get_current_user
from backend.api.schemas import ApiResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v2/verification", tags=["SQL Verification"])


@router.post("/items/{item_code}/verify-qty")
async def verify_item_quantity(
    item_code: str, current_user: Dict[str, Any] = Depends(get_current_user)
) -> ApiResponse[Dict[str, Any]]:
    """
    Verify item quantity against SQL Server

    Updates MongoDB with verification fields:
    - sql_verified_qty: Quantity from SQL Server
    - last_sql_verified_at: Timestamp of verification
    - variance: Difference between SQL and MongoDB quantities
    - mongo_cached_qty_previous: Previous MongoDB quantity
    - sql_qty_mismatch_flag: True if quantities don't match
    """
    try:
        result = await sql_verification_service.verify_item_quantity(item_code)

        if result["success"]:
            return ApiResponse.success_response(
                data=result, message=f"Item {item_code} verified successfully"
            )
        else:
            status_code = result.get("status_code", 500)
            detail = {
                "code": result.get("error_code", "VERIFICATION_ERROR"),
                "message": result.get("message", result.get("error", "Verification failed")),
            }
            if result.get("context"):
                detail["context"] = result["context"]
            if result.get("status"):
                detail["status"] = result["status"]
            if result.get("box_status"):
                detail["box_status"] = result["box_status"]
            raise HTTPException(status_code=status_code, detail=detail)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying item {item_code}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail={"code": "INTERNAL_ERROR", "message": f"An unexpected error occurred: {str(e)}"},
        )
