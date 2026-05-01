import logging
from backend.utils.api_utils import sanitize_for_logging
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import Any, Dict
from backend.auth.dependencies import get_current_user
from backend.config import settings
from backend.services.pi_service import PI_SERVICE_ERRORS, PiService, get_pi_service

logger = logging.getLogger("stock-verify")
router = APIRouter(prefix="/api/pi", tags=["AI Assistant"])
_PI_AUTH_WARNING_EMITTED = False


def _pi_server_headers() -> Dict[str, str]:
    global _PI_AUTH_WARNING_EMITTED

    headers = {"Content-Type": "application/json"}
    if settings.PI_SERVER_API_KEY:
        headers["Authorization"] = f"Bearer {settings.PI_SERVER_API_KEY}"
    elif not _PI_AUTH_WARNING_EMITTED:
        logger.warning("Running pi-server sidecar requests without auth (local mode)")
        _PI_AUTH_WARNING_EMITTED = True
    return headers


async def get_system_stats_context(pi_service: PiService) -> str:
    """Gather real-time stats for the AI Assistant context."""
    try:
        return await pi_service.get_system_stats_context()
    except PI_SERVICE_ERRORS as e:
        logger.error("Error gathering stats for AI context: %s", sanitize_for_logging(str(e)))
        return "System Context: Stats unavailable at the moment."


@router.post("/chat")
async def chat_with_pi(
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Proxy a chat completion request to the pi-server.
    Requires Admin or Supervisor role.
    """
    if current_user.get("role") not in ["admin", "supervisor"]:
        raise HTTPException(
            status_code=403, detail="Only admins and supervisors can use the AI Assistant"
        )

    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    pi_service = get_pi_service()
    messages = body.get("messages", [])

    # Inject System Context as a system message if not already present
    if not any(m.get("role") == "system" for m in messages):
        stats_context = await get_system_stats_context(pi_service)
        messages.insert(
            0,
            {
                "role": "system",
                "content": f"You are the Stock Verify AI Assistant. {stats_context}",
            },
        )
        body["messages"] = messages

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(
                f"{settings.PI_SERVER_URL}/chat/completions",
                json=body,
                headers=_pi_server_headers(),
            )

            if response.status_code != 200:
                logger.error(
                    "pi-server returned error: %s - %s",
                    response.status_code,
                    sanitize_for_logging(response.text),
                )
                return {
                    "error": "AI service is currently unavailable",
                    "status_code": response.status_code,
                }

            result = response.json()

            # Persistent History Store (Rule: Auditability)
            try:
                await pi_service.persist_chat_history(
                    username=current_user["username"],
                    messages=messages,
                    result=result,
                )
            except PI_SERVICE_ERRORS as e:
                logger.error("Failed to persist chat history: %s", sanitize_for_logging(str(e)))

            return result
        except httpx.ConnectError:
            logger.error(
                "Could not connect to pi-server sidecar at %s",
                settings.PI_SERVER_URL,
            )
            raise HTTPException(
                status_code=503,
                detail="AI Assistant sidecar is not running. Please contact the administrator.",
            )
        except (httpx.HTTPError, KeyError, RuntimeError, TypeError, ValueError) as e:
            logger.error("Error communicating with pi-server: %s", sanitize_for_logging(str(e)))
            raise HTTPException(status_code=500, detail="Internal AI error")


@router.get("/history")
async def get_chat_history(
    limit: int = Query(20, ge=1, le=100),
    current_user: Dict[str, Any] = Depends(get_current_user),
    pi_service: PiService = Depends(get_pi_service),
):
    """Retrieve chat history for the current user."""
    history = await pi_service.get_chat_history(username=current_user["username"], limit=limit)
    return {"success": True, "history": history}


@router.get("/status")
async def get_pi_status(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Check if the pi-server sidecar is reachable."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            response = await client.get(
                f"{settings.PI_SERVER_URL}/models",
                headers=_pi_server_headers(),
            )
            return {
                "active": response.status_code == 200,
                "msg": (
                    "AI sidecar is online"
                    if response.status_code == 200
                    else "AI sidecar returned an error"
                ),
            }
        except httpx.HTTPError:
            return {"active": False, "msg": "AI sidecar unreachable"}
