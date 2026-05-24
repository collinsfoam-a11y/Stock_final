import asyncio
import json
import logging
from backend.utils.api_utils import sanitize_for_logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from backend.auth.jwt_provider import decode
from backend.config import settings
from backend.core.websocket_manager import manager

logger = logging.getLogger(__name__)
router = APIRouter()


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

    if token_query:
        environment = str(getattr(settings, "ENVIRONMENT", "development")).strip().lower()
        if environment in {"development", "test"}:
            logger.warning("WebSocket query-token auth used in non-production environment")
            return token_query, None
        logger.warning("WebSocket query-token auth rejected outside development/test")
        return None, None

    return None, None


def _seconds_until_expiry(payload: dict) -> Optional[float]:
    exp = payload.get("exp")
    try:
        expires_at = float(exp)
    except (TypeError, ValueError):
        return None
    return expires_at - datetime.now(timezone.utc).timestamp()


def _parse_replay_cursor(value: Optional[str | int]) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        cursor = int(value)
    except (TypeError, ValueError):
        return None
    return cursor if cursor >= 0 else None


async def _handle_websocket_client_message(
    raw_message: str,
    *,
    websocket: WebSocket,
    user_id: str,
    session_id: Optional[str],
    role: str,
    client_id: Optional[str],
) -> None:
    try:
        data = json.loads(raw_message)
    except (TypeError, ValueError):
        return
    if not isinstance(data, dict):
        return

    message_type = data.get("type")
    if message_type == "replay_request":
        cursor = _parse_replay_cursor(
            data.get("last_ws_sequence")
            or data.get("after_ws_sequence")
            or data.get("after_sequence")
        )
        resolved_cursor = await manager.resolve_replay_after(
            client_id=client_id,
            user_id=user_id,
            session_id=session_id,
            role=role,
            requested_after=cursor,
        )
        await manager.replay_missed(
            websocket,
            user_id=user_id,
            session_id=session_id,
            role=role,
            after_sequence=resolved_cursor,
        )
        return

    if message_type in {"websocket_replay_ack", "replay_ack"}:
        sequence = _parse_replay_cursor(
            data.get("ws_sequence")
            or data.get("last_ack_sequence")
            or data.get("last_ws_sequence")
        )
        if sequence is None:
            return
        await manager.acknowledge_replay(
            client_id=data.get("client_id") or client_id,
            user_id=user_id,
            session_id=session_id,
            role=role,
            ws_sequence=sequence,
            replay_event_id=data.get("replay_event_id") or data.get("event_id"),
        )


@router.websocket("/ws/updates")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None),
    last_ws_sequence: Optional[int] = Query(None),
    ws_client_id: Optional[str] = Query(None),
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
        await websocket.accept()
        await websocket.close(code=1008)
        return

    # Authenticate before accepting
    payload = None
    try:
        if not settings.JWT_SECRET:
            raise ValueError("JWT_SECRET not set")
        payload = decode(jwt_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except Exception as e:
        logger.warning("WebSocket auth failed: %s", sanitize_for_logging(str(e)))

    if not payload:
        # Accept then immediately close with policy violation code
        await websocket.accept()
        await websocket.close(code=1008)
        return

    user_id = payload.get("sub")
    if not user_id:
        await websocket.accept()
        await websocket.close(code=1008)
        return

    # T076: Restrict WebSocket updates to Supervisors and Staff (User)
    role = payload.get("role", "").lower()
    # "user" is the default role for staff in our system (SessionCreate uses "staff", but auth might use "user" or "staff" depending on registration)
    if role not in ["supervisor", "staff", "user", "admin"]:
        logger.warning(
            f"WebSocket connection rejected for user {user_id}: Role '{role}' is not 'supervisor'"
        )
        await websocket.accept()
        await websocket.close(code=1008)
        return

    # Authentication successful - connect via manager (which calls accept)
    try:
        await manager.connect(
            websocket,
            user_id,
            session_id,
            role=role,
            subprotocol=accept_subprotocol,
            replay_after=_parse_replay_cursor(last_ws_sequence),
            client_id=ws_client_id,
        )

        while True:
            seconds_until_expiry = _seconds_until_expiry(payload)
            if seconds_until_expiry is not None and seconds_until_expiry <= 0:
                logger.info("WebSocket token expired for user: %s", sanitize_for_logging(user_id))
                await websocket.close(code=1008)
                manager.disconnect(websocket, user_id, session_id)
                return

            # Keep connection alive and listen for client messages if needed
            timeout = min(seconds_until_expiry, 30.0) if seconds_until_expiry else 30.0
            try:
                raw_message = await asyncio.wait_for(websocket.receive_text(), timeout=timeout)
                await _handle_websocket_client_message(
                    raw_message,
                    websocket=websocket,
                    user_id=user_id,
                    session_id=session_id,
                    role=role,
                    client_id=ws_client_id,
                )
            except asyncio.TimeoutError:
                continue
            # For now, we just echo or ignore. Real logic would go here.
            # await websocket.send_text(f"Message received: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id, session_id)
        logger.info("Client disconnected: %s", sanitize_for_logging(user_id))
    except Exception as e:
        logger.error("WebSocket error: %s", sanitize_for_logging(str(e)))
        manager.disconnect(websocket, user_id, session_id)
        try:
            await websocket.close(code=1011)  # Internal Error
        except Exception:
            pass
