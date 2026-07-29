import logging
from typing import Any
from fastapi import FastAPI
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration

from backend.utils.api_utils import sanitize_for_logging
from backend.utils.tracing import instrument_fastapi_app

logger = logging.getLogger("stock-verify")

def init_observability(app: FastAPI, settings: Any) -> None:
    """Initialize observability tools (Sentry, OpenTelemetry tracing)."""
    # Initialize Sentry if DSN is provided
    sentry_dsn = getattr(settings, "SENTRY_DSN", None)
    if sentry_dsn:
        try:
            sentry_sdk.init(
                dsn=sentry_dsn,
                integrations=[
                    StarletteIntegration(transaction_style="endpoint"),
                    FastApiIntegration(transaction_style="endpoint"),
                ],
                traces_sample_rate=getattr(settings, "SENTRY_TRACES_SAMPLE_RATE", 0.1),
                profiles_sample_rate=getattr(settings, "SENTRY_PROFILES_SAMPLE_RATE", 0.1),
                environment=(
                    getattr(settings, "SENTRY_ENVIRONMENT", None)
                    or getattr(settings, "ENVIRONMENT", "development")
                ),
            )
            logger.info("Sentry SDK initialized")
        except Exception as e:
            logger.warning(
                "Failed to initialize Sentry SDK: %s",
                sanitize_for_logging(str(e), 200),
            )
    else:
        logger.info("Sentry DSN not found, skipping Sentry initialization")

    # Attach OpenTelemetry tracing to the FastAPI app if enabled
    try:
        instrument_fastapi_app(app)
    except Exception:
        # Tracing should never prevent the app from starting
        logger.debug("Suppressed non-fatal exception", exc_info=True)
