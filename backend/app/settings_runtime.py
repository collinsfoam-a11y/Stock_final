"""Runtime boot concerns for direct app execution."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import uvicorn

from backend.utils.port_detector import PortDetector, save_backend_info


def run_server_main(
    *,
    app_import_path: str,
    settings: Any,
    logger: Any,
    project_root: Path,
) -> None:
    """Run uvicorn with environment validation and runtime port/cert selection."""
    try:
        from backend.utils.env_validation import get_env_summary, validate_environment

        validate_environment()
        logger.info("Environment configuration validated successfully")
        logger.info(f"Environment summary: {get_env_summary()}")
    except ImportError:
        logger.warning("Environment validation module not found, skipping validation")
    except ValueError as exc:
        logger.error(f"Environment validation failed: {exc}")
        raise

    start_port = int(getattr(settings, "PORT", os.getenv("PORT", 8001)))
    port = PortDetector.find_available_port(start_port, range(start_port, start_port + 10))
    local_ip = PortDetector.get_local_ip()
    os.environ["PORT"] = str(port)

    default_key = project_root / "nginx" / "ssl" / "privkey.pem"
    default_cert = project_root / "nginx" / "ssl" / "fullchain.pem"

    ssl_keyfile = os.getenv("SSL_KEYFILE", str(default_key))
    ssl_certfile = os.getenv("SSL_CERTFILE", str(default_cert))
    disable_ssl = os.getenv("DISABLE_SSL", "false").lower() == "true"
    use_ssl = (not disable_ssl) and os.path.exists(ssl_keyfile) and os.path.exists(ssl_certfile)

    protocol = "https" if use_ssl else "http"
    save_backend_info(port, local_ip, protocol)

    if use_ssl:
        logger.info(f"🔒 SSL certificates found. Starting server with HTTPS on port {port}...")
        uvicorn.run(
            app_import_path,
            host=os.getenv("HOST", "127.0.0.1"),
            port=port,
            reload=False,
            log_level="info",
            access_log=True,
            log_config=None,
            ssl_keyfile=ssl_keyfile,
            ssl_certfile=ssl_certfile,
        )
        return

    logger.warning("⚠️  No SSL certificates found. Starting server with HTTP (Unencrypted)...")
    logger.info(f"Starting server on port {port}...")
    uvicorn.run(
        app_import_path,
        host=os.getenv("HOST", "0.0.0.0"),  # nosec B104 - Binding to all interfaces is required for Docker and LAN access
        port=port,
        reload=False,
        log_level="info",
        access_log=True,
        log_config=None,
    )
