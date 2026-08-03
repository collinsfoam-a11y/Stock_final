"""Tests for startup_checks — route safety, mobile compatibility, and replica-set guard."""

import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute
from unittest.mock import AsyncMock

from backend.core.startup_checks import (
    assert_mobile_compatibility,
    assert_no_duplicate_routes,
    assert_prefix_consistency,
    check_mongodb_replica_set,
)


def _make_mock_route(path: str, methods: set[str], name: str = "test", responses: dict | None = None):
    return APIRoute(
        path=path,
        endpoint=lambda: {},
        methods=methods,
        name=name,
        responses=responses or {},
    )


class TestDuplicateRouteDetection:
    def test_no_duplicates_passes(self):
        app = FastAPI()
        app.routes.append(_make_mock_route("/api/items", {"GET"}, "get_items"))
        app.routes.append(_make_mock_route("/api/items", {"POST"}, "create_item"))
        assert_no_duplicate_routes(app)

    def test_duplicate_detected(self):
        app = FastAPI()
        app.routes.append(_make_mock_route("/api/items", {"GET"}, "get_items"))
        app.routes.append(_make_mock_route("/api/items", {"GET"}, "get_items_dup"))

        with pytest.raises(RuntimeError, match="Duplicate route"):
            assert_no_duplicate_routes(app)


class TestMobileCompatibility:
    def test_no_redirects_passes(self):
        app = FastAPI()
        app.routes.append(
            _make_mock_route("/api/count-lines", {"POST"}, "create_count_line",
                             responses={200: {"description": "OK"}})
        )
        assert_mobile_compatibility(app)

    def test_301_on_mutation_fails(self):
        app = FastAPI()
        route = _make_mock_route(
            "/api/count-lines", {"POST"}, "create_count_line",
            responses={301: {"description": "Moved"}}
        )
        app.routes.append(route)

        with pytest.raises(RuntimeError, match="301/302.*mutation"):
            assert_mobile_compatibility(app)

    def test_302_on_mutation_fails(self):
        app = FastAPI()
        route = _make_mock_route(
            "/api/sync/batch", {"POST"}, "sync_batch",
            responses={302: {"description": "Found"}}
        )
        app.routes.append(route)

        with pytest.raises(RuntimeError, match="301/302.*mutation"):
            assert_mobile_compatibility(app)

    def test_string_status_key_on_mutation_fails(self):
        """
        FastAPI accepts string keys in `responses`. Comparing raw keys against
        an int set let {"301": ...} slip past the guard.
        """
        app = FastAPI()
        route = _make_mock_route(
            "/api/items", {"PATCH"}, "patch_item",
            responses={"301": {"description": "Moved"}}
        )
        app.routes.append(route)

        with pytest.raises(RuntimeError, match="301/302.*mutation"):
            assert_mobile_compatibility(app)

    def test_non_numeric_response_key_is_ignored(self):
        """A non-numeric key must not blow up the guard."""
        app = FastAPI()
        route = _make_mock_route(
            "/api/items", {"POST"}, "create_item",
            responses={"default": {"description": "Fallback"}}
        )
        app.routes.append(route)

        assert_mobile_compatibility(app)


class TestPrefixConsistency:
    def test_allowed_root_paths_pass(self):
        app = FastAPI()
        app.routes.append(_make_mock_route("/", {"GET"}, "root"))
        app.routes.append(_make_mock_route("/docs", {"GET"}, "docs"))
        app.routes.append(_make_mock_route("/health", {"GET"}, "health"))
        assert_prefix_consistency(app)

    def test_warning_not_error_for_root(self):
        app = FastAPI()
        app.routes.append(_make_mock_route("/items", {"GET"}, "items"))
        # Should warn but not raise
        assert_prefix_consistency(app)


class TestReplicaSetGuard:
    """Verify MongoDB replica-set guard behavior (§4.2, Phase 1 mandatory gate)."""

    @pytest.mark.asyncio
    async def test_passes_with_configured_replica_set(self):
        """Replica-set check passes when replSetGetStatus returns a set name."""
        mock_client = AsyncMock()
        mock_client.admin.command.return_value = {
            "set": "rs0",
            "members": [{"_id": 0, "name": "mongo:27017", "health": 1}],
        }

        result = await check_mongodb_replica_set(mock_client)
        assert result is None  # Function logs and returns None on success

    @pytest.mark.asyncio
    async def test_fails_in_production_with_standalone_mongo(self):
        """Guard raises RuntimeError in production when standalone detected."""
        mock_client = AsyncMock()
        mock_client.admin.command.side_effect = Exception(
            "not running with --replSet"
        )

        import backend.config.core as config_mod
        original = config_mod.settings.ENVIRONMENT
        config_mod.settings.ENVIRONMENT = "production"
        try:
            with pytest.raises(RuntimeError, match="replica set"):
                await check_mongodb_replica_set(mock_client)
        finally:
            config_mod.settings.ENVIRONMENT = original

    @pytest.mark.asyncio
    async def test_warns_in_development_with_standalone_mongo(self):
        """Guard warns but does not raise in development with standalone Mongo."""
        mock_client = AsyncMock()
        mock_client.admin.command.side_effect = Exception(
            "no replset config"
        )

        import backend.config.core as config_mod
        original = config_mod.settings.ENVIRONMENT
        config_mod.settings.ENVIRONMENT = "development"
        try:
            result = await check_mongodb_replica_set(mock_client)
            assert result is None  # Returns without raising in dev
        finally:
            config_mod.settings.ENVIRONMENT = original

    @pytest.mark.asyncio
    async def test_raises_when_command_succeeds_but_reports_no_set(self):
        """
        Regression: replSetGetStatus can succeed while reporting no set name.

        The raise for that case previously sat inside the try block, so the
        RuntimeError was caught by the surrounding `except Exception` and
        downgraded to a warning — the production guard never fired.
        """
        mock_client = AsyncMock()
        mock_client.admin.command.return_value = {"ok": 1}  # no "set" key

        import backend.config.core as config_mod
        original = config_mod.settings.ENVIRONMENT
        config_mod.settings.ENVIRONMENT = "production"
        try:
            with pytest.raises(RuntimeError, match="replica set"):
                await check_mongodb_replica_set(mock_client)
        finally:
            config_mod.settings.ENVIRONMENT = original

    @pytest.mark.asyncio
    async def test_fails_closed_in_production_on_unrelated_error(self):
        """
        An error that is not a recognizable standalone signal (an auth failure
        reaching admin.replSetGetStatus, say) must still fail in production.
        Inability to confirm a replica set is not evidence of a healthy one.
        """
        mock_client = AsyncMock()
        mock_client.admin.command.side_effect = Exception(
            "not authorized on admin to execute command"
        )

        import backend.config.core as config_mod
        original = config_mod.settings.ENVIRONMENT
        config_mod.settings.ENVIRONMENT = "production"
        try:
            with pytest.raises(RuntimeError):
                await check_mongodb_replica_set(mock_client)
        finally:
            config_mod.settings.ENVIRONMENT = original

    @pytest.mark.asyncio
    async def test_warns_in_development_on_unrelated_error(self):
        """The same unverifiable state stays non-fatal in development."""
        mock_client = AsyncMock()
        mock_client.admin.command.side_effect = Exception("connection refused")

        import backend.config.core as config_mod
        original = config_mod.settings.ENVIRONMENT
        config_mod.settings.ENVIRONMENT = "development"
        try:
            assert await check_mongodb_replica_set(mock_client) is None
        finally:
            config_mod.settings.ENVIRONMENT = original
