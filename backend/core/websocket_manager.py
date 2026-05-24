"""
Core WebSocket manager with optional Redis pub/sub fan-out.

Single-worker deployments: all broadcasts are delivered directly to locally
connected WebSocket clients (same behaviour as before).

Multi-worker deployments: once ``attach_redis()`` is called during startup,
every broadcast is published to the ``ws:fanout`` Redis channel.  A background
subscriber loop on *each* worker receives from that channel and delivers the
message to its own locally connected clients.  This guarantees that a scan
event emitted by worker A reaches supervisor clients on worker B (H-06).

Graceful degradation: if Redis is unavailable or the subscriber crashes, the
manager falls back to local-only delivery with a warning log.
"""

import asyncio
import copy
import json
import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import WebSocket
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger(__name__)

_WS_FANOUT_CHANNEL = "ws:fanout"
_WS_REPLAY_SEQUENCE_ID = "global"
_WS_REPLAY_RETENTION_SECONDS = 86_400
_WS_REPLAY_CURSOR_FALLBACK_CLIENT_PREFIX = "user"
_WS_SOCKET_OWNERSHIP_SEQUENCE_ID = "global"
_WS_SOCKET_OWNERSHIP_LEASE_SECONDS = 120
_WS_REPLAY_WORKER_LEASE_SECONDS = 120


class WebSocketReplayPersistenceError(RuntimeError):
    """Raised when a replay-enabled broadcast cannot be durably recorded."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class WebSocketManager:
    def __init__(self, *, worker_id: Optional[str] = None):
        self.worker_id = str(worker_id or f"ws-worker-{uuid.uuid4()}")
        # active_connections: { user_id: [WebSocket, ...] }
        self.active_connections: dict[str, list[WebSocket]] = {}
        # session_connections: { session_id: [WebSocket, ...] }
        self.session_connections: dict[str, list[WebSocket]] = {}
        # user_roles: { user_id: role }
        self.user_roles: dict[str, str] = {}
        # Replay client ownership: one live socket per durable replay cursor identity.
        self.client_connections: dict[str, list[WebSocket]] = {}
        self.connection_client_keys: dict[int, str] = {}

        # Redis fan-out state (None when Redis is not available)
        self._redis: Optional[Any] = None          # RedisService instance
        self._pubsub_task: Optional[asyncio.Task] = None
        self.delivery_failures = 0
        self.replay_persist_failures = 0
        self.replay_deliveries = 0
        self.replay_misses = 0
        self.replay_acknowledgements = 0
        self.replay_ack_rejections = 0
        self.stale_socket_closures = 0
        self.distributed_socket_evictions = 0
        self.stale_socket_delivery_suppressed = 0
        self.replay_worker_lease_rejections = 0
        self._db: Optional[Any] = None
        self._replay_retention_seconds = _WS_REPLAY_RETENTION_SECONDS

    def _collection(self, name: str) -> Any:
        if self._db is None:
            raise RuntimeError("WebSocket replay store is not attached")
        collection = getattr(self._db, name, None)
        if collection is not None:
            return collection
        return self._db[name]

    def attach_replay_store(
        self,
        db: Any,
        *,
        retention_seconds: int = _WS_REPLAY_RETENTION_SECONDS,
    ) -> None:
        """Attach Mongo-backed durable replay storage for missed WebSocket events."""
        self._db = db
        self._replay_retention_seconds = int(retention_seconds)
        logger.info(
            "WebSocket replay store attached (retention_seconds=%s)",
            self._replay_retention_seconds,
        )

    def detach_replay_store(self) -> None:
        self._db = None
        logger.info("WebSocket replay store detached")

    async def _send_json_safe(self, connection: WebSocket, message: dict) -> bool:
        if not await self._connection_has_current_distributed_ownership(connection):
            self.stale_socket_delivery_suppressed += 1
            self._remove_connection_references(connection)
            return False
        try:
            await asyncio.wait_for(connection.send_json(message), timeout=5.0)
            return True
        except Exception as exc:
            self.delivery_failures += 1
            logger.warning("WebSocket delivery failed; dropping stale connection: %s", exc)
            return False

    async def _reserve_socket_ownership_token(self) -> int:
        now_dt = _utc_now()
        collection = self._collection("websocket_socket_ownership_sequences")
        await collection.update_one(
            {"_id": _WS_SOCKET_OWNERSHIP_SEQUENCE_ID},
            {
                "$inc": {"value": 1},
                "$setOnInsert": {
                    "_id": _WS_SOCKET_OWNERSHIP_SEQUENCE_ID,
                    "created_at": now_dt,
                },
                "$set": {"updated_at": now_dt},
            },
            upsert=True,
        )
        doc = await collection.find_one({"_id": _WS_SOCKET_OWNERSHIP_SEQUENCE_ID})
        if not isinstance(doc, dict) or not isinstance(doc.get("value"), int):
            raise RuntimeError("Failed to reserve WebSocket socket ownership token")
        return int(doc["value"])

    async def _claim_distributed_socket_ownership(
        self,
        *,
        client_key: str,
        connection: WebSocket,
        client_id: Optional[str],
        user_id: str,
        session_id: Optional[str],
        role: Optional[str],
    ) -> dict[str, Any]:
        if self._db is None:
            return {
                "claimed": True,
                "distributed": False,
                "client_key": client_key,
                "worker_id": self.worker_id,
            }

        now_dt = _utc_now()
        expires_at = now_dt + timedelta(seconds=_WS_SOCKET_OWNERSHIP_LEASE_SECONDS)
        normalized_client_id = self._normalize_client_id(client_id, user_id)
        connection_id = str(id(connection))
        collection = self._collection("websocket_socket_ownership")
        previous = await collection.find_one({"_id": client_key})
        fencing_token = await self._reserve_socket_ownership_token()

        ownership_doc = {
            "client_key": client_key,
            "client_id": normalized_client_id,
            "aggregate_id": self._cursor_aggregate_id(
                user_id=user_id,
                session_id=session_id,
                role=role,
            ),
            "user_id": user_id,
            "session_id": session_id,
            "role": role,
            "worker_id": self.worker_id,
            "connection_id": connection_id,
            "status": "active",
            "fencing_token": fencing_token,
            "expires_at": expires_at,
            "updated_at": now_dt,
        }
        if isinstance(previous, dict):
            stale_worker_id = previous.get("worker_id")
            result = await collection.update_one(
                {
                    "_id": client_key,
                    "lease_version": int(previous.get("lease_version") or 1),
                },
                {
                    "$set": {
                        **ownership_doc,
                        "previous_worker_id": stale_worker_id,
                        "previous_connection_id": previous.get("connection_id"),
                        "transferred_at": now_dt,
                    },
                    "$inc": {"lease_version": 1},
                },
            )
            if int(getattr(result, "matched_count", 0) or 0) <= 0:
                raise RuntimeError("WebSocket socket ownership changed during reconnect")
            if stale_worker_id and stale_worker_id != self.worker_id:
                self.distributed_socket_evictions += 1
        else:
            await collection.insert_one(
                {
                    "_id": client_key,
                    **ownership_doc,
                    "lease_version": 1,
                    "created_at": now_dt,
                }
            )

        owner = await collection.find_one({"_id": client_key})
        if not isinstance(owner, dict):
            raise RuntimeError("WebSocket socket ownership claim did not persist")
        return owner

    async def _connection_has_current_distributed_ownership(
        self,
        connection: WebSocket,
    ) -> bool:
        if self._db is None:
            return True
        client_key = self.connection_client_keys.get(id(connection))
        if not client_key:
            return True
        owner = await self._collection("websocket_socket_ownership").find_one(
            {"_id": client_key}
        )
        if not isinstance(owner, dict):
            return True
        if owner.get("status") != "active":
            return False
        if str(owner.get("worker_id")) != self.worker_id:
            return False
        if str(owner.get("connection_id")) != str(id(connection)):
            return False
        expires_at = owner.get("expires_at")
        if isinstance(expires_at, datetime) and expires_at <= _utc_now():
            return False
        return True

    async def acquire_replay_worker_lease(
        self,
        *,
        scope_id: str,
        owner: Optional[str] = None,
        lease_seconds: int = _WS_REPLAY_WORKER_LEASE_SECONDS,
    ) -> dict[str, Any]:
        if self._db is None:
            raise RuntimeError("WebSocket replay worker lease store is not attached")

        lease_owner = str(owner or self.worker_id)
        lease_key = f"websocket_replay:{scope_id or 'global'}"
        now_dt = _utc_now()
        expires_at = now_dt + timedelta(seconds=max(int(lease_seconds or 0), 1))
        collection = self._collection("websocket_replay_worker_leases")
        existing = await collection.find_one({"_id": lease_key})
        if isinstance(existing, dict):
            active = isinstance(existing.get("expires_at"), datetime) and (
                existing["expires_at"] > now_dt
            )
            if active and existing.get("owner") != lease_owner:
                self.replay_worker_lease_rejections += 1
                raise RuntimeError(
                    f"WebSocket replay worker lease is held by {existing.get('owner')}"
                )
            fencing_token = await self._reserve_socket_ownership_token()
            result = await collection.update_one(
                {
                    "_id": lease_key,
                    "lease_version": int(existing.get("lease_version") or 1),
                },
                {
                    "$set": {
                        "scope_id": scope_id,
                        "owner": lease_owner,
                        "worker_id": self.worker_id,
                        "fencing_token": fencing_token,
                        "expires_at": expires_at,
                        "renewed_at": now_dt,
                        "updated_at": now_dt,
                    },
                    "$inc": {"lease_version": 1},
                },
            )
            if int(getattr(result, "matched_count", 0) or 0) <= 0:
                self.replay_worker_lease_rejections += 1
                raise RuntimeError("WebSocket replay worker lease changed during acquisition")
        else:
            fencing_token = await self._reserve_socket_ownership_token()
            await collection.insert_one(
                {
                    "_id": lease_key,
                    "scope_id": scope_id,
                    "owner": lease_owner,
                    "worker_id": self.worker_id,
                    "fencing_token": fencing_token,
                    "lease_version": 1,
                    "expires_at": expires_at,
                    "created_at": now_dt,
                    "renewed_at": now_dt,
                    "updated_at": now_dt,
                }
            )

        lease = await collection.find_one({"_id": lease_key})
        if not isinstance(lease, dict):
            raise RuntimeError("WebSocket replay worker lease acquisition did not persist")
        return lease

    async def renew_replay_worker_lease(
        self,
        lease: dict[str, Any],
        *,
        lease_seconds: int = _WS_REPLAY_WORKER_LEASE_SECONDS,
    ) -> dict[str, Any]:
        now_dt = _utc_now()
        result = await self._collection("websocket_replay_worker_leases").update_one(
            {
                "_id": lease.get("_id"),
                "owner": lease.get("owner"),
                "worker_id": self.worker_id,
                "fencing_token": lease.get("fencing_token"),
                "lease_version": int(lease.get("lease_version") or 0),
                "expires_at": {"$gt": now_dt},
            },
            {
                "$set": {
                    "expires_at": now_dt
                    + timedelta(seconds=max(int(lease_seconds or 0), 1)),
                    "renewed_at": now_dt,
                    "updated_at": now_dt,
                },
                "$inc": {"lease_version": 1},
            },
        )
        if int(getattr(result, "matched_count", 0) or 0) <= 0:
            self.replay_worker_lease_rejections += 1
            raise RuntimeError("WebSocket replay worker lease is stale or expired")
        renewed = await self._collection("websocket_replay_worker_leases").find_one(
            {"_id": lease.get("_id")}
        )
        if not isinstance(renewed, dict):
            raise RuntimeError("WebSocket replay worker lease disappeared during renewal")
        return renewed

    async def release_replay_worker_lease(self, lease: dict[str, Any]) -> None:
        if self._db is None:
            return
        await self._collection("websocket_replay_worker_leases").delete_one(
            {
                "_id": lease.get("_id"),
                "owner": lease.get("owner"),
                "worker_id": self.worker_id,
                "fencing_token": lease.get("fencing_token"),
            }
        )

    # ------------------------------------------------------------------ #
    # Redis fan-out wiring                                                 #
    # ------------------------------------------------------------------ #

    async def attach_redis(self, redis_service: Any) -> None:
        """Wire this manager to Redis for cross-worker WebSocket fan-out.

        Called once during application startup when Redis is available.
        Starts a background subscriber task that forwards messages published
        on ``ws:fanout`` to locally connected WebSocket clients.
        """
        self._redis = redis_service
        self._pubsub_task = asyncio.create_task(
            self._subscriber_loop(),
            name="ws-redis-fanout-subscriber",
        )
        logger.info(
            "WebSocket manager: Redis fan-out attached (channel=%s)", _WS_FANOUT_CHANNEL
        )

    async def detach_redis(self) -> None:
        """Stop the Redis subscriber and revert to local-only delivery."""
        if self._pubsub_task and not self._pubsub_task.done():
            self._pubsub_task.cancel()
            try:
                await self._pubsub_task
            except asyncio.CancelledError:
                pass
        self._redis = None
        self._pubsub_task = None
        logger.info("WebSocket manager: Redis fan-out detached")

    async def _subscriber_loop(self) -> None:
        """Background task: receive fan-out envelopes from Redis, deliver locally."""
        redis = self._redis
        try:
            pubsub = redis.client.pubsub()
            await pubsub.subscribe(_WS_FANOUT_CHANNEL)
            logger.debug(
                "WS fan-out subscriber listening on channel %s", _WS_FANOUT_CHANNEL
            )
            async for raw in pubsub.listen():
                if raw["type"] != "message":
                    continue
                try:
                    envelope = json.loads(raw["data"])
                except (json.JSONDecodeError, TypeError):
                    logger.warning(
                        "WS fan-out: malformed message on %s", _WS_FANOUT_CHANNEL
                    )
                    continue
                await self._deliver_local(envelope)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error(
                "WS fan-out subscriber crashed (%s) — falling back to local-only delivery",
                exc,
            )
            # Disable Redis so broadcasts degrade gracefully to local-only
            self._redis = None

    async def _publish(self, envelope: dict) -> None:
        """Publish an envelope to the Redis fan-out channel.

        On failure falls back to local delivery so the originating worker's
        clients still receive the message.
        """
        try:
            await self._redis.publish(_WS_FANOUT_CHANNEL, json.dumps(envelope))
        except Exception as exc:
            logger.warning(
                "WS fan-out publish failed (%s) — falling back to local delivery", exc
            )
            await self._deliver_local(envelope)

    async def _deliver_local(self, envelope: dict) -> None:
        """Route an envelope to locally connected WebSocket clients."""
        target = envelope.get("target")
        payload = self._message_with_replay_metadata(envelope, replayed=False)
        if target == "all":
            await self._local_broadcast_all(payload)
        elif target == "roles":
            roles = set(envelope.get("roles", []))
            await self._local_broadcast_roles(payload, roles)
        elif target == "session":
            await self._local_broadcast_session(payload, envelope.get("session_id", ""))
        elif target == "user":
            await self._local_send_personal(payload, envelope.get("user_id", ""))

    async def _reserve_replay_sequence(self) -> int:
        now_dt = _utc_now()
        collection = self._collection("websocket_replay_sequences")
        await collection.update_one(
            {"_id": _WS_REPLAY_SEQUENCE_ID},
            {
                "$inc": {"value": 1},
                "$setOnInsert": {"_id": _WS_REPLAY_SEQUENCE_ID, "created_at": now_dt},
                "$set": {"updated_at": now_dt},
            },
            upsert=True,
        )
        doc = await collection.find_one({"_id": _WS_REPLAY_SEQUENCE_ID})
        if not isinstance(doc, dict) or not isinstance(doc.get("value"), int):
            raise WebSocketReplayPersistenceError("Failed to reserve WebSocket replay sequence")
        return int(doc["value"])

    async def _persist_replay_envelope(self, envelope: dict) -> dict:
        if self._db is None:
            return envelope

        durable_envelope = copy.deepcopy(envelope)
        now_dt = _utc_now()
        try:
            ws_sequence = await self._reserve_replay_sequence()
            durable_envelope.update(
                {
                    "_id": str(uuid.uuid4()),
                    "ws_sequence": ws_sequence,
                    "created_at": now_dt,
                    "expires_at": now_dt + timedelta(seconds=self._replay_retention_seconds),
                }
            )
            await self._collection("websocket_replay_log").insert_one(durable_envelope)
            return durable_envelope
        except Exception as exc:
            self.replay_persist_failures += 1
            logger.error("WebSocket replay persistence failed: %s", exc)
            raise WebSocketReplayPersistenceError(
                "WebSocket broadcast was not durably recorded"
            ) from exc

    def _message_with_replay_metadata(self, envelope: dict, *, replayed: bool) -> dict:
        payload = envelope.get("payload", {})
        if not isinstance(payload, dict):
            payload = {"payload": payload}
        message = copy.deepcopy(payload)
        ws_sequence = envelope.get("ws_sequence")
        if ws_sequence is None:
            return message
        message["ws_sequence"] = int(ws_sequence)
        replay_meta = message.get("replay") if isinstance(message.get("replay"), dict) else {}
        replay_meta.update(
            {
                "ws_sequence": int(ws_sequence),
                "replay_event_id": envelope.get("_id"),
                "target": envelope.get("target"),
                "created_at": (
                    envelope.get("created_at").isoformat()
                    if isinstance(envelope.get("created_at"), datetime)
                    else envelope.get("created_at")
                ),
                "replayed": replayed,
            }
        )
        message["replay"] = replay_meta
        return message

    @staticmethod
    def _normalize_client_id(client_id: Optional[str], user_id: str) -> str:
        normalized = str(client_id or "").strip()
        if normalized:
            return normalized[:128]
        return f"{_WS_REPLAY_CURSOR_FALLBACK_CLIENT_PREFIX}:{user_id}"

    @staticmethod
    def _cursor_aggregate_id(
        *,
        user_id: str,
        session_id: Optional[str],
        role: Optional[str],
    ) -> str:
        return ":".join(
            [
                "ws",
                str(user_id),
                str(session_id or "global"),
                str(role or "unknown").lower(),
            ]
        )

    @classmethod
    def _cursor_id(
        cls,
        *,
        client_id: str,
        user_id: str,
        session_id: Optional[str],
        role: Optional[str],
    ) -> str:
        aggregate_id = cls._cursor_aggregate_id(
            user_id=user_id,
            session_id=session_id,
            role=role,
        )
        return f"{client_id}:{aggregate_id}"

    @classmethod
    def _client_connection_key(
        cls,
        *,
        client_id: Optional[str],
        user_id: str,
        session_id: Optional[str],
        role: Optional[str],
    ) -> str:
        normalized_client_id = cls._normalize_client_id(client_id, user_id)
        return cls._cursor_id(
            client_id=normalized_client_id,
            user_id=user_id,
            session_id=session_id,
            role=role,
        )

    def _remove_connection_references(self, connection: WebSocket) -> None:
        for user_id, user_connections in list(self.active_connections.items()):
            alive = [candidate for candidate in user_connections if candidate is not connection]
            if alive:
                self.active_connections[user_id] = alive
            else:
                self.active_connections.pop(user_id, None)
                self.user_roles.pop(user_id, None)

        for session_id, session_connections in list(self.session_connections.items()):
            alive = [candidate for candidate in session_connections if candidate is not connection]
            if alive:
                self.session_connections[session_id] = alive
            else:
                self.session_connections.pop(session_id, None)

        client_key = self.connection_client_keys.pop(id(connection), None)
        if client_key:
            client_connections = [
                candidate
                for candidate in self.client_connections.get(client_key, [])
                if candidate is not connection
            ]
            if client_connections:
                self.client_connections[client_key] = client_connections
            else:
                self.client_connections.pop(client_key, None)

    async def _invalidate_stale_client_connections(
        self,
        *,
        client_key: str,
        replacement: WebSocket,
    ) -> None:
        stale_connections = [
            connection
            for connection in self.client_connections.get(client_key, [])
            if connection is not replacement
        ]
        for connection in stale_connections:
            self._remove_connection_references(connection)
            try:
                await connection.close(code=4000, reason="Superseded reconnect")
            except Exception as exc:
                self.delivery_failures += 1
                logger.warning("Failed to close stale WebSocket connection: %s", exc)
            self.stale_socket_closures += 1
        self.client_connections[client_key] = [replacement]
        self.connection_client_keys[id(replacement)] = client_key

    async def get_replay_cursor(
        self,
        *,
        client_id: Optional[str],
        user_id: str,
        session_id: Optional[str] = None,
        role: Optional[str] = None,
    ) -> Optional[dict]:
        if self._db is None:
            return None
        normalized_client_id = self._normalize_client_id(client_id, user_id)
        cursor_id = self._cursor_id(
            client_id=normalized_client_id,
            user_id=user_id,
            session_id=session_id,
            role=role,
        )
        cursor = await self._collection("websocket_replay_cursors").find_one({"_id": cursor_id})
        return cursor if isinstance(cursor, dict) else None

    async def resolve_replay_after(
        self,
        *,
        client_id: Optional[str],
        user_id: str,
        session_id: Optional[str] = None,
        role: Optional[str] = None,
        requested_after: Optional[int] = None,
    ) -> Optional[int]:
        cursor = await self.get_replay_cursor(
            client_id=client_id,
            user_id=user_id,
            session_id=session_id,
            role=role,
        )
        durable_sequence = (
            int(cursor["last_ack_sequence"])
            if isinstance(cursor, dict) and isinstance(cursor.get("last_ack_sequence"), int)
            else None
        )
        if durable_sequence is None:
            return requested_after
        if requested_after is None:
            return durable_sequence
        return max(durable_sequence, int(requested_after))

    async def acknowledge_replay(
        self,
        *,
        client_id: Optional[str],
        user_id: str,
        session_id: Optional[str] = None,
        role: Optional[str] = None,
        ws_sequence: int,
        replay_event_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """Persist a monotonic, idempotent replay cursor for a connected client."""
        if self._db is None:
            self.replay_ack_rejections += 1
            return {"acknowledged": False, "reason": "replay_store_unavailable"}

        try:
            sequence = int(ws_sequence)
        except (TypeError, ValueError):
            self.replay_ack_rejections += 1
            return {"acknowledged": False, "reason": "invalid_sequence"}
        if sequence <= 0:
            self.replay_ack_rejections += 1
            return {"acknowledged": False, "reason": "invalid_sequence"}

        envelope = await self._collection("websocket_replay_log").find_one(
            {"ws_sequence": sequence}
        )
        if not isinstance(envelope, dict):
            self.replay_ack_rejections += 1
            return {"acknowledged": False, "reason": "unknown_sequence"}
        if replay_event_id and str(envelope.get("_id")) != str(replay_event_id):
            self.replay_ack_rejections += 1
            return {"acknowledged": False, "reason": "replay_event_mismatch"}
        if not self._can_receive_replay(
            envelope,
            user_id=user_id,
            session_id=session_id,
            role=role,
        ):
            self.replay_ack_rejections += 1
            return {"acknowledged": False, "reason": "unauthorized_sequence"}

        normalized_client_id = self._normalize_client_id(client_id, user_id)
        aggregate_id = self._cursor_aggregate_id(
            user_id=user_id,
            session_id=session_id,
            role=role,
        )
        cursor_id = self._cursor_id(
            client_id=normalized_client_id,
            user_id=user_id,
            session_id=session_id,
            role=role,
        )
        existing = await self._collection("websocket_replay_cursors").find_one(
            {"_id": cursor_id}
        )
        existing_sequence = (
            int(existing["last_ack_sequence"])
            if isinstance(existing, dict) and isinstance(existing.get("last_ack_sequence"), int)
            else None
        )
        if existing_sequence is not None and existing_sequence >= sequence:
            self.replay_acknowledgements += 1
            return {
                "acknowledged": True,
                "idempotent": True,
                "last_ack_sequence": existing_sequence,
            }

        now_dt = _utc_now()
        update_doc = {
            "$set": {
                "client_id": normalized_client_id,
                "aggregate_id": aggregate_id,
                "user_id": user_id,
                "session_id": session_id,
                "role": role,
                "last_ack_event_id": str(envelope.get("_id")),
                "last_ack_sequence": sequence,
                "updated_at": now_dt,
            },
            "$setOnInsert": {"_id": cursor_id, "created_at": now_dt},
        }
        if existing_sequence is None:
            try:
                await self._collection("websocket_replay_cursors").insert_one(
                    {
                        "_id": cursor_id,
                        "client_id": normalized_client_id,
                        "aggregate_id": aggregate_id,
                        "user_id": user_id,
                        "session_id": session_id,
                        "role": role,
                        "last_ack_event_id": str(envelope.get("_id")),
                        "last_ack_sequence": sequence,
                        "created_at": now_dt,
                        "updated_at": now_dt,
                    }
                )
            except DuplicateKeyError:
                return await self.acknowledge_replay(
                    client_id=normalized_client_id,
                    user_id=user_id,
                    session_id=session_id,
                    role=role,
                    ws_sequence=sequence,
                    replay_event_id=replay_event_id,
                )
        else:
            result = await self._collection("websocket_replay_cursors").update_one(
                {
                    "_id": cursor_id,
                    "last_ack_sequence": {"$lt": sequence},
                },
                update_doc,
                upsert=False,
            )
            if result.matched_count == 0:
                cursor = await self.get_replay_cursor(
                    client_id=normalized_client_id,
                    user_id=user_id,
                    session_id=session_id,
                    role=role,
                )
                current_sequence = int(cursor.get("last_ack_sequence", existing_sequence))
                self.replay_acknowledgements += 1
                return {
                    "acknowledged": True,
                    "idempotent": current_sequence >= sequence,
                    "last_ack_sequence": current_sequence,
                }

        self.replay_acknowledgements += 1
        return {
            "acknowledged": True,
            "idempotent": False,
            "last_ack_sequence": sequence,
        }

    async def replay_compaction_watermark(
        self,
        *,
        safety_margin_sequences: int = 0,
    ) -> dict[str, Any]:
        """
        Compute the highest replay sequence that can be pruned without crossing
        any durable client cursor.
        """
        if self._db is None:
            return {
                "safe_to_compact": False,
                "reason": "replay_store_unavailable",
                "watermark_sequence": None,
                "active_cursor_count": 0,
            }

        cursor_sequences: list[int] = []
        async for cursor in self._collection("websocket_replay_cursors").find({}):
            try:
                sequence = int(cursor.get("last_ack_sequence"))
            except (TypeError, ValueError):
                continue
            if sequence > 0:
                cursor_sequences.append(sequence)

        if not cursor_sequences:
            return {
                "safe_to_compact": False,
                "reason": "no_durable_cursors",
                "watermark_sequence": None,
                "active_cursor_count": 0,
            }

        margin = max(int(safety_margin_sequences or 0), 0)
        watermark = max(min(cursor_sequences) - margin, 0)
        return {
            "safe_to_compact": watermark > 0,
            "reason": None if watermark > 0 else "watermark_within_safety_margin",
            "watermark_sequence": watermark,
            "minimum_ack_sequence": min(cursor_sequences),
            "safety_margin_sequences": margin,
            "active_cursor_count": len(cursor_sequences),
        }

    async def compact_replay_log(
        self,
        *,
        safety_margin_sequences: int = 0,
        max_delete: int = 1000,
    ) -> dict[str, Any]:
        """
        Prune acknowledged replay messages using the minimum durable cursor as
        the compaction boundary.
        """
        watermark = await self.replay_compaction_watermark(
            safety_margin_sequences=safety_margin_sequences,
        )
        if not watermark.get("safe_to_compact"):
            return {
                **watermark,
                "deleted_count": 0,
                "compacted_through_sequence": None,
            }

        safe_sequence = int(watermark["watermark_sequence"])
        limit = max(int(max_delete or 0), 0)
        if limit <= 0:
            return {
                **watermark,
                "deleted_count": 0,
                "compacted_through_sequence": None,
                "reason": "max_delete_not_positive",
            }

        deleted_count = 0
        compacted_through_sequence: Optional[int] = None
        cursor = (
            self._collection("websocket_replay_log")
            .find({"ws_sequence": {"$lte": safe_sequence}})
            .sort("ws_sequence", 1)
            .limit(limit)
        )
        async for envelope in cursor:
            sequence = int(envelope.get("ws_sequence") or 0)
            result = await self._collection("websocket_replay_log").delete_one(
                {"_id": envelope.get("_id"), "ws_sequence": {"$lte": safe_sequence}}
            )
            if int(getattr(result, "deleted_count", 0) or 0) > 0:
                deleted_count += 1
                compacted_through_sequence = max(compacted_through_sequence or 0, sequence)

        return {
            **watermark,
            "deleted_count": deleted_count,
            "compacted_through_sequence": compacted_through_sequence,
        }

    @staticmethod
    def _can_receive_replay(
        envelope: dict,
        *,
        user_id: str,
        session_id: Optional[str],
        role: Optional[str],
    ) -> bool:
        target = envelope.get("target")
        if target == "all":
            return True
        if target == "user":
            return str(envelope.get("user_id") or "") == str(user_id)
        if target == "session":
            return bool(session_id) and str(envelope.get("session_id") or "") == str(session_id)
        if target == "roles":
            normalized_role = str(role or "").lower()
            return normalized_role in {str(r).lower() for r in envelope.get("roles", [])}
        return False

    async def replay_missed(
        self,
        websocket: WebSocket,
        *,
        user_id: str,
        session_id: Optional[str] = None,
        role: Optional[str] = None,
        after_sequence: Optional[int] = None,
        limit: int = 500,
    ) -> int:
        """Replay durable messages newer than ``after_sequence`` to one connection."""
        if self._db is None or after_sequence is None:
            return 0
        try:
            cursor = (
                self._collection("websocket_replay_log")
                .find({"ws_sequence": {"$gt": int(after_sequence)}})
                .sort("ws_sequence", 1)
                .limit(limit)
            )
            delivered = 0
            async for envelope in cursor:
                if not self._can_receive_replay(
                    envelope,
                    user_id=user_id,
                    session_id=session_id,
                    role=role,
                ):
                    continue
                if not await self._send_json_safe(
                    websocket,
                    self._message_with_replay_metadata(envelope, replayed=True),
                ):
                    break
                delivered += 1
            self.replay_deliveries += delivered
            if delivered == 0:
                self.replay_misses += 1
            return delivered
        except Exception as exc:
            logger.warning("WebSocket replay failed for user=%s: %s", user_id, exc)
            self.delivery_failures += 1
            return 0

    # ------------------------------------------------------------------ #
    # Connection management                                                #
    # ------------------------------------------------------------------ #

    async def connect(
        self,
        websocket: WebSocket,
        user_id: str,
        session_id: str = None,
        role: Optional[str] = None,
        *,
        subprotocol: Optional[str] = None,
        replay_after: Optional[int] = None,
        client_id: Optional[str] = None,
    ):
        if subprotocol:
            await websocket.accept(subprotocol=subprotocol)
        else:
            await websocket.accept()

        client_key = self._client_connection_key(
            client_id=client_id,
            user_id=user_id,
            session_id=session_id,
            role=role,
        )
        await self._claim_distributed_socket_ownership(
            client_key=client_key,
            connection=websocket,
            client_id=client_id,
            user_id=user_id,
            session_id=session_id,
            role=role,
        )
        await self._invalidate_stale_client_connections(
            client_key=client_key,
            replacement=websocket,
        )

        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

        if session_id:
            if session_id not in self.session_connections:
                self.session_connections[session_id] = []
            self.session_connections[session_id].append(websocket)

        if role:
            self.user_roles[user_id] = role

        logger.info("WebSocket connected: user=%s, session=%s", user_id, session_id)
        replay_cursor = await self.resolve_replay_after(
            client_id=client_id,
            user_id=user_id,
            session_id=session_id,
            role=role,
            requested_after=replay_after,
        )
        await self.replay_missed(
            websocket,
            user_id=user_id,
            session_id=session_id,
            role=role,
            after_sequence=replay_cursor,
        )

    def disconnect(self, websocket: WebSocket, user_id: str, session_id: str = None):
        self._remove_connection_references(websocket)
        logger.info("WebSocket disconnected: user=%s, session=%s", user_id, session_id)

    # ------------------------------------------------------------------ #
    # Local-only delivery helpers (called by _deliver_local and fallback) #
    # ------------------------------------------------------------------ #

    async def _local_send_personal(self, message: dict, user_id: str) -> None:
        alive = []
        for connection in list(self.active_connections.get(user_id, [])):
            if await self._send_json_safe(connection, message):
                alive.append(connection)
            else:
                self._remove_connection_references(connection)
        if alive:
            self.active_connections[user_id] = alive
        else:
            self.active_connections.pop(user_id, None)
            self.user_roles.pop(user_id, None)

    async def _local_broadcast_session(self, message: dict, session_id: str) -> None:
        alive = []
        for connection in list(self.session_connections.get(session_id, [])):
            if await self._send_json_safe(connection, message):
                alive.append(connection)
            else:
                self._remove_connection_references(connection)
        if alive:
            self.session_connections[session_id] = alive
        else:
            self.session_connections.pop(session_id, None)

    async def _local_broadcast_all(self, message: dict) -> None:
        for user_id, user_connections in list(self.active_connections.items()):
            alive = []
            for connection in list(user_connections):
                if await self._send_json_safe(connection, message):
                    alive.append(connection)
                else:
                    self._remove_connection_references(connection)
            if alive:
                self.active_connections[user_id] = alive
            else:
                self.active_connections.pop(user_id, None)
                self.user_roles.pop(user_id, None)

    async def _local_broadcast_roles(self, message: dict, roles: set) -> None:
        normalized_roles = {r.lower() for r in roles}
        for user_id, user_connections in list(self.active_connections.items()):
            user_role = (self.user_roles.get(user_id) or "").lower()
            if user_role not in normalized_roles:
                continue
            alive = []
            for connection in list(user_connections):
                if await self._send_json_safe(connection, message):
                    alive.append(connection)
                else:
                    self._remove_connection_references(connection)
            if alive:
                self.active_connections[user_id] = alive
            else:
                self.active_connections.pop(user_id, None)
                self.user_roles.pop(user_id, None)

    # ------------------------------------------------------------------ #
    # Public broadcast API                                                 #
    # When Redis is attached, messages are published to the fan-out       #
    # channel so every worker's subscriber loop delivers them locally.    #
    # When Redis is unavailable, delivery is local-only.                  #
    # ------------------------------------------------------------------ #

    async def send_personal_message(self, message: dict, user_id: str) -> None:
        envelope = await self._persist_replay_envelope(
            {"target": "user", "user_id": user_id, "payload": message}
        )
        if self._redis is not None:
            await self._publish(envelope)
        else:
            await self._local_send_personal(
                self._message_with_replay_metadata(envelope, replayed=False),
                user_id,
            )

    async def broadcast_to_session(self, message: dict, session_id: str) -> None:
        envelope = await self._persist_replay_envelope(
            {"target": "session", "session_id": session_id, "payload": message}
        )
        if self._redis is not None:
            await self._publish(envelope)
        else:
            await self._local_broadcast_session(
                self._message_with_replay_metadata(envelope, replayed=False),
                session_id,
            )

    async def broadcast_all(self, message: dict) -> None:
        envelope = await self._persist_replay_envelope({"target": "all", "payload": message})
        if self._redis is not None:
            await self._publish(envelope)
        else:
            await self._local_broadcast_all(
                self._message_with_replay_metadata(envelope, replayed=False)
            )

    async def broadcast_to_roles(self, message: dict, roles: set[str]) -> None:
        envelope = await self._persist_replay_envelope(
            {"target": "roles", "roles": list(roles), "payload": message}
        )
        if self._redis is not None:
            await self._publish(envelope)
        else:
            await self._local_broadcast_roles(
                self._message_with_replay_metadata(envelope, replayed=False),
                roles,
            )

    # ------------------------------------------------------------------ #
    # Diagnostics                                                          #
    # ------------------------------------------------------------------ #

    async def get_connection_stats(self) -> dict:
        """Get WebSocket WebSocket connection statistics."""
        return {
            "total_users": len(self.active_connections),
            "total_sessions": len(self.session_connections),
            "redis_fanout": self._redis is not None,
            "replay_store": self._db is not None,
            "delivery_failures": self.delivery_failures,
            "replay_persist_failures": self.replay_persist_failures,
            "replay_deliveries": self.replay_deliveries,
            "replay_misses": self.replay_misses,
            "replay_acknowledgements": self.replay_acknowledgements,
            "replay_ack_rejections": self.replay_ack_rejections,
            "stale_socket_closures": self.stale_socket_closures,
            "distributed_socket_evictions": self.distributed_socket_evictions,
            "stale_socket_delivery_suppressed": self.stale_socket_delivery_suppressed,
            "replay_worker_lease_rejections": self.replay_worker_lease_rejections,
            "worker_id": self.worker_id,
            "user_connections": {
                user_id: len(connections)
                for user_id, connections in self.active_connections.items()
            },
            "session_connections": {
                session_id: len(connections)
                for session_id, connections in self.session_connections.items()
            },
        }

    async def ping_all(self) -> int:
        """Ping all local connections to check liveness. Returns responsive count."""
        responsive = 0
        for user_id, connections in list(self.active_connections.items()):
            alive = []
            for conn in connections:
                try:
                    await asyncio.wait_for(
                        conn.send_json({"type": "ping", "timestamp": time.time()}),
                        timeout=5.0,
                    )
                    responsive += 1
                    alive.append(conn)
                except Exception as exc:
                    self.delivery_failures += 1
                    self._remove_connection_references(conn)
                    logger.warning("WebSocket ping failed; dropping stale connection: %s", exc)
            if alive:
                self.active_connections[user_id] = alive
            else:
                self.active_connections.pop(user_id, None)
                self.user_roles.pop(user_id, None)
        return responsive


manager = WebSocketManager()
