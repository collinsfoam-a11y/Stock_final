"""
Simple in-memory MongoDB substitute for backend unit tests.
Provides async collection helpers that mimic the subset of Motor APIs our tests use.
"""

from __future__ import annotations

import copy
import os
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from backend.services.activity_log import ActivityLogService
from backend.services.error_log import ErrorLogService
from backend.services.refresh_token import RefreshTokenService
from backend.config import settings


def _normalize_value(val: Any) -> Any:
    """Normalize values for comparison (e.g. ObjectId -> str)."""
    if hasattr(val, "__class__") and val.__class__.__name__ == "ObjectId":
        return str(val)
    return val


def _match_condition(value: Any, condition: dict[str, Any]) -> bool:
    """Evaluate comparison operators."""
    # Handle regex with options if present
    if "$regex" in condition:
        import re

        pattern = condition["$regex"]
        options = condition.get("$options", "")
        flags = 0
        if "i" in options:
            flags |= re.IGNORECASE

        if not re.search(pattern, str(value), flags):
            return False

    for op, expected in condition.items():
        if op == "$regex" or op == "$options":
            continue

        expected = _normalize_value(expected)

        if op == "$lt" and not (value < expected):
            return False
        if op == "$lte" and not (value <= expected):
            return False
        if op == "$gt" and not (value > expected):
            return False
        if op == "$gte" and not (value >= expected):
            return False
        if op == "$ne" and not (value != expected):
            return False
        if op == "$in":
            if not isinstance(expected, list):
                return False
            if value not in expected:
                return False
            continue
        if op == "$nin":
            if not isinstance(expected, list):
                return False
            if value in expected:
                return False
            continue
        if op not in {"$lt", "$lte", "$gt", "$gte", "$ne", "$regex", "$options", "$in", "$nin"}:
            raise ValueError(f"Unsupported operator: {op}")
    return True


def _matches_exists_logic(document: dict[str, Any], key: str, value: dict[str, Any]) -> bool:
    """Helper to handle $exists operator logic."""
    should_exist = value["$exists"]
    does_exist = key in document

    if does_exist != should_exist:
        return False

    # If we effectively passed the existence check, see if there are other operators
    condition_without_exists = {k: v for k, v in value.items() if k != "$exists"}
    if not condition_without_exists:
        return True

    # If the field doesn't exist but we passed requirements (e.g. $exists: False),
    # we shouldn't evaluate other operators against None usually.
    if not does_exist:
        return True

    doc_value = document.get(key)
    return _match_condition(doc_value, condition_without_exists)


def _match_filter(document: dict[str, Any], filter_query: dict[str, Optional[Any]]) -> bool:
    """Basic Mongo-style filter matching."""
    if not filter_query:
        return True

    for key, value in filter_query.items():
        if key == "$or":
            if not any(_match_filter(document, clause) for clause in value):
                return False
            continue

        # Handle $exists specifically
        if isinstance(value, dict) and "$exists" in value:
            if not _matches_exists_logic(document, key, value):
                return False
            continue

        doc_value = document.get(key)
        if isinstance(value, dict):
            if not _match_condition(doc_value, value):
                return False
        else:
            value = _normalize_value(value)
            if doc_value != value:
                return False
    return True


def _apply_update(document: dict[str, Any], update: dict[str, Any]) -> bool:
    """Apply $set updates to the document."""
    modified = False
    set_values = update.get("$set", {})
    for key, value in set_values.items():
        if document.get(key) != value:
            document[key] = value
            modified = True

    inc_values = update.get("$inc", {})
    for key, delta in inc_values.items():
        current = document.get(key, 0)
        if current is None:
            current = 0
        try:
            next_value = current + delta
        except Exception as exc:
            raise ValueError(f"Unsupported $inc for field '{key}': {exc}") from exc

        if document.get(key) != next_value:
            document[key] = next_value
            modified = True

    return modified


@dataclass
class InsertOneResult:
    inserted_id: str


@dataclass
class UpdateResult:
    matched_count: int
    modified_count: int
    upserted_id: Optional[str] = None


@dataclass
class DeleteResult:
    deleted_count: int


class InMemoryCursor:
    def __init__(self, documents: Iterable[dict[str, Any]]):
        self._documents = list(documents)

    def sort(self, key: str, direction: int) -> InMemoryCursor:
        reverse = direction < 0
        self._documents.sort(key=lambda doc: doc.get(key, datetime.min), reverse=reverse)
        return self

    def skip(self, count: int) -> InMemoryCursor:
        self._documents = self._documents[count:]
        return self

    def limit(self, count: int) -> InMemoryCursor:
        self._documents = self._documents[:count]
        return self

    def batch_size(self, size: int) -> InMemoryCursor:
        """Set batch size (no-op for in-memory, just returns self for chaining)."""
        return self

    async def to_list(self, length: int) -> list[dict[str, Any]]:
        return [copy.deepcopy(doc) for doc in self._documents[:length]]

    def __aiter__(self):
        self._iter_index = 0
        return self

    async def __anext__(self):
        if self._iter_index < len(self._documents):
            doc = self._documents[self._iter_index]
            self._iter_index += 1
            return copy.deepcopy(doc)
        raise StopAsyncIteration


class InMemoryCollection:
    def __init__(self):
        self._documents: list[dict[str, Any]] = []

    def _ensure_id(self, document: dict[str, Any]) -> None:
        # Use 24-char hex string to mimic ObjectId
        document.setdefault("_id", os.urandom(12).hex())

    async def find_one(
        self, filter: Optional[dict[str, Any]] = None, *args, **kwargs
    ) -> dict[str, Optional[Any]]:
        # Handle case where filter is None (Motor allows this)
        filter_query = filter or {}

        # Handle sort being passed in kwargs (Motor style)
        documents = self._documents
        if "sort" in kwargs and kwargs["sort"]:
            sort_key, direction = kwargs["sort"][0]
            reverse = direction < 0
            # Need a stable sort, and handle missing keys
            documents = sorted(documents, key=lambda doc: doc.get(sort_key, ""), reverse=reverse)

        for doc in documents:
            if _match_filter(doc, filter_query):
                return copy.deepcopy(doc)
        return None

    async def insert_one(self, document: dict[str, Any], *args, **kwargs) -> InsertOneResult:
        doc_copy = copy.deepcopy(document)
        self._ensure_id(doc_copy)
        self._documents.append(doc_copy)
        return InsertOneResult(inserted_id=doc_copy["_id"])

    async def insert_many(self, documents: list[dict[str, Any]], ordered: bool = True) -> list[str]:
        ids = []
        for document in documents:
            doc_copy = copy.deepcopy(document)
            self._ensure_id(doc_copy)
            self._documents.append(doc_copy)
            ids.append(doc_copy["_id"])
        return ids

    async def replace_one(
        self,
        filter_query: dict[str, Optional[Any]],
        replacement: dict[str, Any],
        upsert: bool = False,
    ) -> UpdateResult:
        """
        Replaces a single document matching the filter.
        """
        for i, doc in enumerate(self._documents):
            if _match_filter(doc, filter_query):
                # Preserve _id from original doc unless replacement has it (usually replacement shouldn't have _id)
                original_id = doc.get("_id")
                new_doc = copy.deepcopy(replacement)
                if "_id" not in new_doc and original_id:
                    new_doc["_id"] = original_id

                self._documents[i] = new_doc
                return UpdateResult(matched_count=1, modified_count=1)

        if upsert:
            new_doc = copy.deepcopy(replacement)
            # Apply filter keys to new doc if they fit (simple equality)
            if filter_query:
                for key, value in filter_query.items():
                    if not key.startswith("$") and key not in new_doc:
                        new_doc[key] = value

            self._ensure_id(new_doc)
            self._documents.append(new_doc)
            return UpdateResult(matched_count=0, modified_count=1, upserted_id=new_doc["_id"])

        return UpdateResult(matched_count=0, modified_count=0)

    async def update_one(
        self,
        filter_query: dict[str, Optional[Any]],
        update: dict[str, Any],
        upsert: bool = False,
        array_filters: Optional[
            list[dict]
        ] = None,  # Added array_filters to signature to match generic usage
    ) -> UpdateResult:
        for doc in self._documents:
            if _match_filter(doc, filter_query):
                modified = _apply_update(doc, update)
                return UpdateResult(
                    matched_count=1,
                    modified_count=1 if modified else 0,
                )

        if upsert:
            new_doc: dict[str, Any] = {}
            if filter_query:
                for key, value in filter_query.items():
                    if not key.startswith("$"):
                        new_doc[key] = value
            set_on_insert = update.get("$setOnInsert", {})
            new_doc.update(set_on_insert)
            _apply_update(new_doc, update)
            self._ensure_id(new_doc)
            self._documents.append(new_doc)
            return UpdateResult(matched_count=0, modified_count=1, upserted_id=new_doc["_id"])

        return UpdateResult(matched_count=0, modified_count=0)

    async def update_many(
        self,
        filter_query: dict[str, Optional[Any]],
        update: dict[str, Any],
    ) -> UpdateResult:
        matched = 0
        modified = 0
        for doc in self._documents:
            if _match_filter(doc, filter_query):
                matched += 1
                if _apply_update(doc, update):
                    modified += 1
        return UpdateResult(matched_count=matched, modified_count=modified)

    async def delete_one(self, filter_query: dict[str, Optional[Any]]) -> DeleteResult:
        for i, doc in enumerate(self._documents):
            if _match_filter(doc, filter_query):
                self._documents.pop(i)
                return DeleteResult(deleted_count=1)
        return DeleteResult(deleted_count=0)

    async def delete_many(self, filter_query: dict[str, Optional[Any]]) -> DeleteResult:
        to_keep = []
        deleted = 0
        for doc in self._documents:
            if _match_filter(doc, filter_query):
                deleted += 1
            else:
                to_keep.append(doc)
        self._documents = to_keep
        return DeleteResult(deleted_count=deleted)

    async def count_documents(self, filter_query: dict[str, Optional[Any]] = None) -> int:
        return sum(1 for doc in self._documents if _match_filter(doc, filter_query))

    def find(
        self,
        filter_query: dict[str, Optional[Any]] = None,
        projection: dict[str, Optional[int]] = None,
    ):
        results = []
        for doc in self._documents:
            if _match_filter(doc, filter_query):
                if projection:
                    projected = {}
                    include_fields = [k for k, v in projection.items() if v]
                    if include_fields:
                        for field in include_fields:
                            if field in doc and projection[field]:
                                projected[field] = doc[field]
                        results.append(projected)
                        continue
                results.append(doc)
        return InMemoryCursor(results)

    def aggregate(self, pipeline: list[dict[str, Any]]) -> InMemoryCursor:
        # For now, return empty cursor or basic aggregation if needed
        # This is a mock, so we can just return empty list or implement basic logic
        return InMemoryCursor([])


class InMemoryDatabase:
    """Container that mimics the Motor database object used throughout the app."""

    def __init__(self):
        self.client = self
        self.users = InMemoryCollection()
        self.pin_authentication = InMemoryCollection()  # Added for PIN auth
        self.refresh_tokens = InMemoryCollection()
        self.login_attempts = InMemoryCollection()
        self.activity_logs = InMemoryCollection()
        self.error_logs = InMemoryCollection()
        self.data_archive = InMemoryCollection()
        self.sessions = InMemoryCollection()
        self.count_lines = InMemoryCollection()
        self.count_line_drafts = InMemoryCollection()
        self.unknown_items = InMemoryCollection()
        self.erp_items = InMemoryCollection()
        self.erp_sync_metadata = InMemoryCollection()
        self.erp_config = InMemoryCollection()
        self.verification_logs = InMemoryCollection()
        self.verification_sessions = InMemoryCollection()
        self.verification_records = InMemoryCollection()
        self.item_variances = InMemoryCollection()
        self.items = InMemoryCollection()
        self.variances = InMemoryCollection()
        self.sync_conflicts = InMemoryCollection()
        self.verification_conflicts = InMemoryCollection()
        self.idempotency_operations = InMemoryCollection()
        self.user_settings = InMemoryCollection()
        self.audit_logs = InMemoryCollection()
        self.system_events = InMemoryCollection()
        self.item_serials = InMemoryCollection()

        # Governance Collections
        self.system_settings = InMemoryCollection()
        self.config_versions = InMemoryCollection()
        self.session_snapshots = InMemoryCollection()
        self.stock_snapshots = InMemoryCollection()
        self.conflict_forks = InMemoryCollection()
        self.governance_events = InMemoryCollection()

    async def command(self, *_args, **_kwargs):
        """Simulate db.command('ping')."""
        return {"ok": 1}

    def __getitem__(self, name: str) -> InMemoryCollection:
        """Allow accessing collections via db['name']."""
        if hasattr(self, name):
            return getattr(self, name)

        # Create dynamically if not exists (mimics Mongo behavior)
        collection = InMemoryCollection()
        setattr(self, name, collection)
        return collection


def setup_server_with_in_memory_db(monkeypatch) -> InMemoryDatabase:
    """
    Patch the FastAPI server module to use an in-memory database and lightweight services.
    Returns the database instance for further customization in tests.
    """
    from typing import cast

    from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

    import backend.server as server_module
    from backend.db.runtime import set_client, set_db

    fake_db = InMemoryDatabase()
    monkeypatch.setattr(server_module, "db", fake_db)

    # Initialize runtime database reference for tests
    set_db(cast(AsyncIOMotorDatabase, fake_db))
    set_client(cast(AsyncIOMotorClient, fake_db.client))

    # Setup core services
    _setup_core_services(monkeypatch, fake_db, server_module)

    # Setup mocked external services
    _setup_mock_services(monkeypatch, server_module)

    # Setup cache and Redis
    fake_redis_service = _setup_cache_and_redis(monkeypatch, server_module)

    monkeypatch.setenv("RATE_LIMIT_ENABLED", "false")
    monkeypatch.setattr(settings, "AUTH_SINGLE_SESSION", False)
    # Initialize APIs
    _initialize_apis(monkeypatch, fake_db, server_module, fake_redis_service)

    # Setup auth and seed users
    _setup_auth_and_seed_users(monkeypatch, fake_db, server_module)

    return fake_db


def _setup_core_services(monkeypatch, fake_db, server_module) -> None:
    """Setup core services like refresh tokens, activity logs, error logs."""
    from typing import cast

    from motor.motor_asyncio import AsyncIOMotorDatabase

    from backend.services.runtime import set_refresh_token_service

    refresh_service = RefreshTokenService(
        cast(AsyncIOMotorDatabase, fake_db),
        server_module.SECRET_KEY,
        server_module.ALGORITHM,
    )
    server_module.refresh_token_service = refresh_service
    set_refresh_token_service(refresh_service)

    server_module.activity_log_service = ActivityLogService(cast(AsyncIOMotorDatabase, fake_db))
    server_module.error_log_service = ErrorLogService(cast(AsyncIOMotorDatabase, fake_db))

    class _NoOpMigrationManager:
        async def ensure_indexes(self):
            return None

        async def run_migrations(self):
            return None

    import backend.core.lifespan as lifespan_module

    monkeypatch.setattr(lifespan_module, "migration_manager", _NoOpMigrationManager())
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "false")


def _setup_mock_services(monkeypatch, server_module) -> None:
    """Setup mocked SQL connector, health service, auto sync, and export service."""
    from unittest.mock import AsyncMock, MagicMock

    import backend.core.lifespan as lifespan_module

    # Mock SQL Connector
    mock_sql = MagicMock()
    mock_sql.connect.return_value = None
    mock_sql.test_connection.return_value = False
    monkeypatch.setattr(lifespan_module, "sql_connector", mock_sql)

    # Mock DatabaseHealthService
    mock_health = MagicMock()
    mock_health.start = MagicMock()
    mock_health.stop = MagicMock()
    mock_health.check_mongo_health = AsyncMock(return_value={"status": "healthy"})
    mock_health.check_sql_server_health = AsyncMock(return_value={"status": "healthy"})

    # Patch the class in server module if it's imported there, otherwise just the instance in lifespan
    if hasattr(server_module, "DatabaseHealthService"):
        monkeypatch.setattr(
            server_module, "DatabaseHealthService", MagicMock(return_value=mock_health)
        )

    monkeypatch.setattr(lifespan_module, "database_health_service", mock_health)

    # Mock AutoSyncManager
    mock_auto_sync = MagicMock()
    mock_auto_sync.start = AsyncMock()
    mock_auto_sync.stop = AsyncMock()

    if hasattr(server_module, "AutoSyncManager"):
        monkeypatch.setattr(
            server_module, "AutoSyncManager", MagicMock(return_value=mock_auto_sync)
        )

    # Note: auto_sync_manager might not be in lifespan global scope directly if it's set via set_auto_sync_manager
    # But checking lifespan just in case
    if hasattr(lifespan_module, "auto_sync_manager"):
        monkeypatch.setattr(lifespan_module, "auto_sync_manager", mock_auto_sync)

    # Mock ScheduledExportService
    mock_export_service = MagicMock()
    mock_export_service.start = MagicMock()
    mock_export_service.stop = MagicMock()

    if hasattr(server_module, "ScheduledExportService"):
        monkeypatch.setattr(
            server_module,
            "ScheduledExportService",
            MagicMock(return_value=mock_export_service),
        )

    monkeypatch.setattr(lifespan_module, "scheduled_export_service", mock_export_service)


def _setup_cache_and_redis(monkeypatch, server_module) -> Any:
    """Setup cache service and Redis mock."""
    from unittest.mock import AsyncMock

    from backend.services.cache_service import CacheService
    from backend.services.runtime import set_cache_service

    mock_cache = CacheService(redis_url=None)  # Force in-memory
    mock_cache.initialize = AsyncMock()  # type: ignore
    monkeypatch.setattr(server_module, "cache_service", mock_cache)
    set_cache_service(mock_cache)

    # Setup fake Redis service
    from backend.services import redis_service as redis_module
    from backend.services.redis_service import get_redis as redis_dependency

    fake_redis_service = _FakeRedisService()

    async def _override_get_redis():  # type: ignore
        return fake_redis_service

    monkeypatch.setattr(redis_module, "redis_service", fake_redis_service)
    monkeypatch.setattr(redis_module, "get_redis", _override_get_redis)
    server_module.app.dependency_overrides[redis_dependency] = _override_get_redis

    return mock_cache


def _initialize_apis(monkeypatch, fake_db, server_module, cache_service) -> None:
    """Initialize all API modules with the fake database."""
    from typing import cast

    from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

    from backend.api.count_lines_api import init_count_lines_api
    from backend.api.erp_api import init_erp_api
    from backend.api.item_verification_api import init_verification_api
    from backend.auth.dependencies import init_auth_dependencies

    init_auth_dependencies(
        cast(AsyncIOMotorDatabase, fake_db),
        getattr(server_module, "SECRET_KEY", "test-secret"),
        getattr(server_module, "ALGORITHM", "HS256"),
    )
    init_verification_api(cast(AsyncIOMotorDatabase, fake_db))
    init_erp_api(cast(AsyncIOMotorDatabase, fake_db), cache_service)

    # Patch the server module's database and client
    server_module.db = cast(AsyncIOMotorDatabase, fake_db)
    server_module.client = cast(AsyncIOMotorClient, fake_db.client)

    # Patch the runtime database and client
    from backend.db.runtime import set_client, set_db

    set_db(cast(AsyncIOMotorDatabase, fake_db))
    set_client(cast(AsyncIOMotorClient, fake_db.client))

    # Initialize APIs that depend on global db
    init_count_lines_api(server_module.activity_log_service)


def _setup_auth_and_seed_users(monkeypatch, fake_db, server_module) -> None:
    """Setup authentication overrides and seed default test users."""
    pass

    # Patch server module's auth settings to match test env
    server_module.SECRET_KEY = os.getenv("JWT_SECRET", "test-jwt-secret-key-for-testing-only")
    server_module.ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

    # Updated seed function to populate both users collection and pin_authentication collection
    def _seed_user(username: str, password: str, full_name: str, role: str):
        user_id = os.urandom(12).hex()  # Generate persistent ID
        fake_db.users._documents.append(
            {
                "_id": user_id,
                "username": username,
                "hashed_password": server_module.get_password_hash(password),
                "full_name": full_name,
                "role": role,
                "is_active": True,
                "permissions": [],
                "created_at": datetime.now(timezone.utc),
            }
        )
        return user_id

    # Create users
    staff_id = _seed_user("staff1", "staff123", "Staff Member", "staff")
    _seed_user("supervisor", "super123", "Supervisor", "supervisor")
    _seed_user("admin", "admin123", "Administrator", "admin")

    from backend.utils.crypto_utils import get_pin_lookup_hash

    hashed_pin = server_module.get_password_hash("1234")
    lookup_hash = get_pin_lookup_hash("1234")

    # Update the user document for auth.py's implementation
    for user in fake_db.users._documents:
        if user["username"] == "staff1":
            user["pin_hash"] = hashed_pin
            user["pin_lookup_hash"] = lookup_hash
            break

    # Populate pin_authentication collection for pin_auth_api.py's implementation
    fake_db.pin_authentication._documents.append(
        {
            "_id": os.urandom(12).hex(),
            "user_id": staff_id,
            "pin_hash": hashed_pin,
            "created_at": datetime.now(timezone.utc),
            "enabled": True,
            "failed_attempts": 0,
            "locked_until": None,
            "last_used": None,
        }
    )


class _FakeRedisService:
    """Minimal Redis substitute for unit tests."""

    def __init__(self) -> None:
        self.is_connected = True

        class _Client:
            async def scan(self, *_args, **_kwargs):
                return 0, []

        self.client = _Client()

    async def connect(self) -> None:
        self.is_connected = True

    async def disconnect(self) -> None:
        self.is_connected = False

    async def set(
        self,
        _key: str,
        _value: Any,
        ex: Optional[int] = None,
        px: Optional[int] = None,
        nx: bool = False,
        xx: bool = False,
    ) -> bool:
        return True

    async def get(self, _key: str) -> Optional[str]:
        return None

    async def delete(self, *_keys: str) -> int:
        return 0

    async def exists(self, *_keys: str) -> int:
        return 0

    async def expire(self, _key: str, _seconds: int) -> bool:
        return True

    async def ttl(self, _key: str) -> int:
        return -1

    async def incr(self, _key: str) -> int:
        return 1

    async def decr(self, _key: str) -> int:
        return 0

    async def hget(self, *_args, **_kwargs):
        return None

    async def hset(self, *_args, **_kwargs):
        return 0

    async def hgetall(self, *_args, **_kwargs):
        return {}

    async def hdel(self, *_args, **_kwargs):
        return 0

    async def sadd(self, *_args, **_kwargs):
        return 0

    async def smembers(self, *_args, **_kwargs):
        return set()

    async def srem(self, *_args, **_kwargs):
        return 0

    async def zadd(self, *_args, **_kwargs):
        return 0

    async def zrange(self, *_args, **_kwargs):
        return []

    async def publish(self, *_args, **_kwargs):
        return 0

    async def pipeline(self):  # pragma: no cover - simple stub
        class _Pipeline:
            async def hset(self, *_args, **_kwargs):
                return self

            async def expire(self, *_args, **_kwargs):
                return self

            async def execute(self):
                return []

        return _Pipeline()
