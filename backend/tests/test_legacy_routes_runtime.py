from backend.api import legacy_routes_impl
from backend.core import lifespan


def test_lifespan_injects_into_legacy_route_implementation_module():
    original_db = legacy_routes_impl.db
    sentinel = object()

    try:
        lifespan.legacy_routes.db = sentinel
        assert legacy_routes_impl.db is sentinel
    finally:
        legacy_routes_impl.db = original_db
