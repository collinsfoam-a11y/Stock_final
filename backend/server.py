"""Compatibility entrypoint for the backend FastAPI app.

Implementation moved to ``backend.app.factory`` to keep this module focused
on import/export stability for runtime and tests.
"""

import logging
from pathlib import Path

from backend.app.factory import *  # noqa: F401,F403
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
