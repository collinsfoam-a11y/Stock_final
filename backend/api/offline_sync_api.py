"""
L07 — Durable Offline Command Protocol

Exposes POST /api/commands/sync, which accepts an idempotent batch of
device-side command journal entries, applies server-side deduplication,
and returns per-command acknowledgements or conflict/rejection reasons.

Design goals
------------
* Idempotent retries: same command_id + same payload_hash returns prior ack.
* Security: same command_id + different payload_hash is a security conflict.
* Ordering guard: lower device sequence than the last processed one is rejected.
* Policy guard: staff payloads must not contain approval-related fields.
* Atomicity: business write and acknowledgement are persisted in one transaction.
"""

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException

from backend.api.schemas import (
    CommandState,
    CommandSyncRequest,
    CommandSyncResponse,
    CommandType,
)
from backend.auth.dependencies import get_current_user_async as get_current_user
from backend.db.runtime import get_db
from backend.models.audit import AuditLogStatus
from backend.services.activity_log import ActivityLogService
from backend.core.uow import MongoUnitOfWork

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/commands", tags=["Offline Commands"])

# Approval-related keys that staff payloads must never carry.
_STAFF_FORBIDDEN_PAYLOAD_KEYS: set[str] = {"approved_by", "approved_at", "locked", "locked_by"}


def _sha256(payload: dict[str, Any]) -> str:
    raw = str(sorted(payload.items())).encode()
    return hashlib.sha256(raw).hexdigest()


def _now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _has_approval_fields(payload: dict[str, Any]) -> bool:
    return any(key in payload for key in _STAFF_FORBIDDEN_PAYLOAD_KEYS)


def _ack_doc(command_id: str, state: str, last_error: Optional[str] = None) -> dict[str, Any]:
    return {"command_id": command_id, "state": state, "last_error": last_error}


def _reject_doc(command_id: str, reason: str, last_error: str) -> dict[str, Any]:
    return {"command_id": command_id, "state": "REJECTED", "reason": reason, "last_error": last_error}


async def _get_activity_service() -> ActivityLogService:
    svc = ActivityLogService(get_db())
    await svc.initialize()
    return svc


@router.post("/sync", response_model=CommandSyncResponse)
async def sync_commands(
    request: CommandSyncRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> CommandSyncResponse:
    """
    Idempotent device-to-server command sync.

    Rules (in transaction order):
    1. Reject if device sequence is below the last processed sequence for this device.
    2. For each command, look up existing command_journal entry by command_id:
       - same command_id + same hash  -> ACKNOWLEDGED (idempotent return)
       - same command_id + different hash -> CONFLICT (security)
       - unknown command_id -> process new command
    3. Staff payloads containing approval fields are rejected as BLOCKED_POLICY.
    4. New commands are inserted with state=PENDING or ACKNOWLEDGED.
    """
    db = get_db()
    command_journal = db["command_journal"]
    accepted: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    acks: dict[str, dict[str, Any]] = {}
    device_id = request.device_id

    device_seq_state = await command_journal.find_one(
        {"device_id": device_id},
        sort=[("client_sequence", -1)],
    )
    last_processed_seq = (
        device_seq_state.get("client_sequence", -1) if device_seq_state else -1
    )

    for cmd in request.commands:
        cmd_state = cmd.state or CommandState.PENDING.value
        try:
            existing = await command_journal.find_one({"command_id": cmd.command_id})

            if existing:
                existing_hash: str = existing.get("payload_hash", "")
                if existing_hash == cmd.payload_hash:
                    ack = _ack_doc(cmd.command_id, existing.get("state", "ACKNOWLEDGED"))
                    acks[cmd.command_id] = ack
                    accepted.append(ack)
                    continue

                acks[cmd.command_id] = _ack_doc(
                    cmd.command_id,
                    "CONFLICT",
                    "payload_hash_mismatch",
                )
                rejected.append(
                    _reject_doc(
                        cmd.command_id,
                        "SECURITY_CONFLICT",
                        "payload_hash_mismatch",
                    )
                )
                continue

            if cmd.client_sequence <= last_processed_seq:
                rejected.append(
                    _reject_doc(
                        cmd.command_id,
                        "SEQUENCE_TOO_LOW",
                        f"client_sequence {cmd.client_sequence} <= last_processed {last_processed_seq}",
                    )
                )
                continue

            actor_id = current_user.get("id") or current_user.get("username", "unknown")
            role: str = current_user.get("role", "staff")

            if role == "staff" and _has_approval_fields(cmd.payload):
                rejected.append(
                    _reject_doc(
                        cmd.command_id,
                        "BLOCKED_POLICY",
                        "staff_payload_contains_approval_fields",
                    )
                )
                continue

            final_hash = cmd.payload_hash or _sha256(cmd.payload)
            entry_doc = {
                "command_id": cmd.command_id,
                "device_id": device_id,
                "client_sequence": cmd.client_sequence,
                "actor_id": actor_id,
                "master_session_id": cmd.master_session_id,
                "location_session_id": cmd.location_session_id,
                "item_code": cmd.item_code,
                "command_type": cmd.command_type.value
                if isinstance(cmd.command_type, CommandType)
                else cmd.command_type,
                "payload": cmd.payload,
                "payload_hash": final_hash,
                "created_at": cmd.created_at or _now_utc(),
                "state": cmd_state,
                "retry_count": cmd.retry_count,
                "last_error": cmd.last_error,
            }

            async with MongoUnitOfWork(db.client) as uow:
                await command_journal.insert_one(entry_doc)

            ack = _ack_doc(cmd.command_id, cmd_state)
            acks[cmd.command_id] = ack
            accepted.append(ack)

            activity_service = await _get_activity_service()
            await activity_service.log(
                actor_id=actor_id,
                action="offline_command_sync",
                resource_id=cmd.command_id,
                status=AuditLogStatus.SUCCESS,
                metadata={
                    "command_type": cmd.command_type.value
                    if isinstance(cmd.command_type, CommandType)
                    else cmd.command_type,
                    "device_id": device_id,
                    "command_id": cmd.command_id,
                },
            )

        except HTTPException:
            raise
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception("Failed to process command %s", cmd.command_id)
            rejected.append(
                _reject_doc(cmd.command_id, "INTERNAL_ERROR", str(exc))
            )

    return CommandSyncResponse(
        accepted=accepted,
        rejected=rejected,
        acks=acks,
        client_batch_id=request.client_batch_id,
    )
