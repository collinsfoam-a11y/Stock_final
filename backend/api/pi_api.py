import logging
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import Any, Dict
from backend.auth.dependencies import get_current_user
from backend.db.runtime import get_db
from backend.config import settings

logger = logging.getLogger("stock-verify")
router = APIRouter(prefix="/api/pi", tags=["AI Assistant"])


async def get_system_stats_context(db: Any) -> str:
    """Gather real-time stats for the AI Assistant context."""
    try:
        total_items = await db.erp_items.count_documents({})
        verified_items = await db.erp_items.count_documents({"verified": True})
        active_sessions = await db.sessions.count_documents({"status": {"$in": ["OPEN", "ACTIVE"]}})
        total_scans = await db.count_lines.count_documents({})

        # Calculate overall accuracy
        pipeline = [
            {
                "$group": {
                    "_id": None,
                    "accurate": {"$sum": {"$cond": [{"$eq": ["$variance", 0]}, 1, 0]}},
                }
            }
        ]
        stats = await db.count_lines.aggregate(pipeline).to_list(1)
        accuracy = (stats[0]["accurate"] / total_scans * 100) if total_scans > 0 else 100

        return (
            f"System Context (Live Stats):\n"
            f"- Total ERP Items: {total_items}\n"
            f"- Verified Items: {verified_items}\n"
            f"- Active Count Sessions: {active_sessions}\n"
            f"- Total Scans Performed: {total_scans}\n"
            f"- Overall Session Accuracy: {accuracy:.1f}%\n"
        )
    except Exception as e:
        logger.error(f"Error gathering stats for AI context: {e}")
        return "System Context: Stats unavailable at the moment."


@router.post("/chat")
async def chat_with_pi(request: Request, current_user: Dict[str, Any] = Depends(get_current_user)):
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
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    db = get_db()
    messages = body.get("messages", [])

    # Inject System Context as a system message if not already present
    if not any(m.get("role") == "system" for m in messages):
        stats_context = await get_system_stats_context(db)
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
                headers={
                    "Content-Type": "application/json",
                    "Authorization": "Bearer sk-antigravity",
                },
            )

            if response.status_code != 200:
                logger.error(f"pi-server returned error: {response.status_code} - {response.text}")
                return {
                    "error": "AI service is currently unavailable",
                    "status_code": response.status_code,
                }

            result = response.json()

            # Persistent History Store (Rule: Auditability)
            try:
                # Save user's last message if present
                user_msg = next((m for m in reversed(messages) if m["role"] == "user"), None)
                assistant_completion = (
                    result["choices"][0]["message"] if result.get("choices") else None
                )

                if user_msg and assistant_completion:
                    await db.chat_history.insert_one(
                        {
                            "username": current_user["username"],
                            "timestamp": datetime.now(timezone.utc),
                            "user_message": user_msg["content"],
                            "assistant_response": assistant_completion["content"],
                            "model": result.get("model", "unknown"),
                        }
                    )
            except Exception as e:
                logger.error(f"Failed to persist chat history: {e}")

            return result
        except httpx.ConnectError:
            logger.error(
                "Could not connect to pi-server sidecar. Ensure it is running on localhost:3000"
            )
            raise HTTPException(
                status_code=503,
                detail="AI Assistant sidecar is not running. Please contact the administrator.",
            )
        except Exception as e:
            logger.error(f"Error communicating with pi-server: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal AI error")


@router.get("/history")
async def get_chat_history(
    limit: int = Query(20, ge=1, le=100), current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Retrieve chat history for the current user."""
    db = get_db()
    cursor = (
        db.chat_history.find({"username": current_user["username"]}, {"_id": 0})
        .sort("timestamp", -1)
        .limit(limit)
    )

    history = await cursor.to_list(None)
    return {"success": True, "history": history}


@router.get("/status")
async def get_pi_status(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Check if the pi-server sidecar is reachable."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            response = await client.get(f"{settings.PI_SERVER_URL}/models")
            return {
                "active": response.status_code == 200,
                "msg": (
                    "AI sidecar is online"
                    if response.status_code == 200
                    else "AI sidecar returned an error"
                ),
            }
        except Exception:
            return {"active": False, "msg": "AI sidecar unreachable"}
