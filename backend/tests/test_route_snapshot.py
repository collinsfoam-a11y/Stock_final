import json
import os
from pathlib import Path

import pytest
from fastapi.routing import APIRoute

from backend.app_factory import app


MUTATION_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
FORBIDDEN_REDIRECT_CODES = {301, 302}


def _extract_routes():
    routes = []
    for route in app.routes:
        if isinstance(route, APIRoute):
            routes.append(
                {"path": route.path, "name": route.name, "methods": sorted(route.methods)}
            )
    routes.sort(key=lambda x: (x["path"], x["name"]))
    return routes


def test_route_snapshot():
    routes = _extract_routes()

    snapshot_path = Path(__file__).parent / "snapshots" / "route_baseline.json"

    if os.environ.get("UPDATE_SNAPSHOTS") == "1" or not snapshot_path.exists():
        snapshot_path.parent.mkdir(parents=True, exist_ok=True)
        with open(snapshot_path, "w") as f:
            json.dump(routes, f, indent=2)
        print(f"Generated route snapshot at {snapshot_path}")
        return

    with open(snapshot_path, "r") as f:
        baseline = json.load(f)

    assert routes == baseline, (
        "Routes have changed! If intentional, run with UPDATE_SNAPSHOTS=1. "
        f"Added: {[r for r in routes if r not in baseline]} "
        f"Removed: {[r for r in baseline if r not in routes]}"
    )


def test_no_duplicate_routes():
    seen = {}
    duplicates = []

    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        for method in route.methods or []:
            if method in {"HEAD", "OPTIONS"}:
                continue
            key = (route.path, method)
            if key in seen:
                duplicates.append(
                    f"{key[1]} {key[0]} registered by both '{seen[key]}' and '{route.name}'"
                )
            else:
                seen[key] = route.name

    assert not duplicates, "Duplicate route registrations:\n" + "\n".join(duplicates)


def test_no_301_302_on_mutation_paths():
    violations = []

    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        if not any(m in MUTATION_METHODS for m in (route.methods or set())):
            continue

        responses = getattr(route, "responses", None) or {}
        for status_code in responses:
            if status_code in FORBIDDEN_REDIRECT_CODES:
                violations.append(
                    f"{route.name} {route.path} [{sorted(route.methods)}] "
                    f"has {status_code} redirect on a mutation path"
                )

    assert not violations, (
        "Mobile compatibility violation:\n" + "\n".join(violations)
    )


def test_health_router_registered_once():
    health_paths = set()

    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        if route.path.startswith("/health") or route.path.startswith("/api/health"):
            if "GET" in (route.methods or []):
                health_paths.add(route.path)

    expected = {
        "/health",
        "/health/",
        "/health/live",
        "/health/ready",
        "/health/startup",
        "/health/detailed",
        "/api/health",
        "/api/health/",
        "/api/health/live",
        "/api/health/ready",
        "/api/health/startup",
        "/api/health/detailed",
    }

    missing = expected - health_paths
    extra = health_paths - expected

    assert not missing, f"Missing expected health routes: {missing}"
    assert not extra, f"Unexpected health routes (possible double-registration): {extra}"
