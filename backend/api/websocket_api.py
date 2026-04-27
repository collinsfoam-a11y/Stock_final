import logging
from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from backend.auth.jwt_provider import decode
from backend.config import settings
from backend.core.websocket_manager import manager

logger = logging.getLogger(__name__)
router = APIRouter()
ALLOWED_WEBSOCKET_ROLES = {"supervisor", "staff", "user", "admin"}


def _parse_subprotocols(header_value: Optional[str]) -> list[str]:
    if not header_value:
        return []
    return [p.strip() for p in header_value.split(",") if p.strip()]


def _extract_jwt_from_websocket(
    websocket: WebSocket, token_query: Optional[str]
) -> tuple[Optional[str], Optional[str]]:
    """Extract JWT token from Authorization header, subprotocol, or legacy query param.

    Returns:
        (token, accept_subprotocol) where accept_subprotocol should be echoed back
        in websocket.accept(subprotocol=...) if applicable.
    """
    auth_header = websocket.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip(), None

    subprotocols = _parse_subprotocols(websocket.headers.get("sec-websocket-protocol"))
    if len(subprotocols) >= 2 and subprotocols[0].lower() in {"jwt", "bearer"}:
        return subprotocols[1], subprotocols[0].lower()

    # Some clients may send a single subprotocol; accept it if it looks like a JWT.
    if len(subprotocols) == 1 and subprotocols[0].count(".") == 2:
        return subprotocols[0], None

    cookie_token = websocket.cookies.get(
        getattr(settings, "AUTH_ACCESS_COOKIE_NAME", "sv_access_token")
    )
    if cookie_token and len(cookie_token) >= 2 and cookie_token[0] == cookie_token[-1] == '"':
        cookie_token = cookie_token[1:-1]
    if cookie_token:
        return cookie_token, None

    # Legacy support (avoid in production; URLs may be logged by intermediaries)
    if token_query:
        return token_query, None

    return None, None


async def _close_policy_violation(websocket: WebSocket) -> None:
    await websocket.accept()
    await websocket.close(code=1008)


def _decode_websocket_payload(jwt_token: str) -> Optional[dict]:
    try:
        if not settings.JWT_SECRET:
            raise ValueError("JWT_SECRET not set")
        return decode(jwt_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except Exception as exc:
        logger.warning("WebSocket auth failed: %s", str(exc))
        return None


def _resolve_websocket_identity(payload: dict) -> tuple[Optional[str], str]:
    return payload.get("sub"), str(payload.get("role", "")).lower()


def _is_allowed_websocket_role(role: str) -> bool:
    return role in ALLOWED_WEBSOCKET_ROLES


async def _consume_websocket_messages(websocket: WebSocket) -> None:
    while True:
        await websocket.receive_text()


@router.websocket("/ws/updates")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None),
):
    """WebSocket endpoint for real-time updates.

    Only supervisors can connect.
    Authentication supports:
    - Authorization: Bearer <token>
    - Sec-WebSocket-Protocol: jwt,<token> (preferred for browsers/clients without headers)
    - HttpOnly access-token cookie (browser session restore)
    - Legacy query param ?token=... (discouraged)
    """
    jwt_token, accept_subprotocol = _extract_jwt_from_websocket(websocket, token)

    if not jwt_token:
        await _close_policy_violation(websocket)
        return

    payload = _decode_websocket_payload(jwt_token)
    if not payload:
        await _close_policy_violation(websocket)
        return

    user_id, role = _resolve_websocket_identity(payload)
    if not user_id:
        await _close_policy_violation(websocket)
        return

    if not _is_allowed_websocket_role(role):
        logger.warning(
            "WebSocket connection rejected for user %s: role '%s' is not allowed",
            user_id,
            role,
        )
        await _close_policy_violation(websocket)
        return

    try:
        await manager.connect(
            websocket,
            user_id,
            session_id,
            role=role,
            subprotocol=accept_subprotocol,
        )
        await _consume_websocket_messages(websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id, session_id)
        logger.info("Client disconnected: %s", user_id)
    except Exception as exc:
        logger.error("WebSocket error: %s", str(exc))
        manager.disconnect(websocket, user_id, session_id)
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
