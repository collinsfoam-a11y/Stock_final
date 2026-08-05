"""Compatibility entrypoint for the backend FastAPI app.

Implementation moved to ``backend.app.factory`` to keep this module focused
on import/export stability for runtime and tests.
"""

import logging
from pathlib import Path

from backend.api.count_lines_api import get_count_lines, unverify_stock, verify_stock  # noqa: F401

# Since run_server_main uses "backend.server:app", we must export it here.
from backend.app.factory import create_app
from backend.app.settings_runtime import run_server_main
from backend.app_factory import *  # noqa: F403 - back-compat shim: re-exports the moved module's public API
from backend.auth.dependencies import get_current_user  # noqa: F401
from backend.config import settings
from backend.core.lifespan import cache_service  # noqa: F401

app = create_app()


def main() -> None:
    """Run the backend using the shared runtime bootstrap without re-importing app_factory."""
    run_server_main(
        app_import_path="backend.server:app",
        settings=settings,
        logger=logging.getLogger("stock-verify"),
        project_root=Path(__file__).resolve().parent.parent,
    )


if __name__ == "__main__":
    main()
