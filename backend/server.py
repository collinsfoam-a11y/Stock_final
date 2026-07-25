import os
import sys

# Add the backend directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import logging
from pathlib import Path

from backend.app.factory import *  # noqa: F403
from backend.api.count_lines_api import get_count_lines, unverify_stock, verify_stock  # noqa: F401
from backend.auth.dependencies import get_current_user  # noqa: F401
from backend.core.lifespan import cache_service  # noqa: F401
from backend.app.settings_runtime import run_server_main
from backend.config import settings


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
