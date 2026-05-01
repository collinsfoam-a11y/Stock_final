from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from backend.api.response_models import ApiResponse
from backend.auth.dependencies import get_current_user_async as get_current_user
from backend.services.ai_variance import ai_variance_service
from backend.services.session_query_service import (
    SessionQueryService,
    get_session_query_service,
)

router = APIRouter()


class RiskPrediction(BaseModel):
    item_code: str
    item_name: str
    category: str
    risk_score: float
    reason: str


@router.get("/predictions", response_model=ApiResponse[list[RiskPrediction]])
async def get_session_predictions(
    session_id: str = Query(..., description="The ID of the session to analyze"),
    limit: int = Query(10, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
    session_service: SessionQueryService = Depends(get_session_query_service),
):
    """
    Get AI-calculated risk predictions for items in a session.
    Helps supervisors identify potential variances that need double-checking.
    """
    try:
        # Check if user is supervisor or admin
        user_role = current_user.get("role", "staff")
        if user_role not in ["supervisor", "admin"]:
            # We still allow it for now but in production we would restrict
            pass

        predictions_data = await session_service.predict_session_risks(
            risk_service=ai_variance_service,
            session_id=session_id,
            limit=limit,
        )

        predictions = [RiskPrediction(**p) for p in predictions_data]

        return ApiResponse.success_response(
            data=predictions,
            message=f"Generated {len(predictions)} risk predictions for session {session_id}",
        )

    except (RuntimeError, TypeError, ValueError) as e:
        return ApiResponse.error_response(
            error_code="PREDICTION_ERROR",
            error_message=f"Failed to generate predictions: {str(e)}",
        )
