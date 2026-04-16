from __future__ import annotations

"""
Structured Logging Configuration
Provides JSON and text-based logging with different levels
"""

import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


class NonClosingStreamHandler(logging.StreamHandler):
    """Stream handler that avoids closing or replacing the underlying stream."""

    def __init__(self, stream=None):
        base_stream = stream or getattr(sys, "__stdout__", sys.stdout)
        super().__init__(base_stream)

    def close(self) -> None:  # pragma: no cover
        # Keep the stream attached so reused app loggers cannot end up with a
        # handler whose ``stream`` is ``None`` after lifecycle/logger resets.
        self.flush()
        logging.Handler.close(self)


class AppNameFilter(logging.Filter):
    """Normalize emitted records to the configured application name."""

    def __init__(self, app_name: str):
        super().__init__()
        self.app_name = app_name

    def filter(self, record: logging.LogRecord) -> bool:
        record.app_logger_name = self.app_name
        record.source_logger = record.name
        return True


class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging"""

    def __init__(self, app_name: str | None = None):
        super().__init__()
        self.app_name = app_name

    def format(self, record: logging.LogRecord) -> str:
        logger_name = self.app_name or record.name
        log_data = {
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            "level": record.levelname,
            "logger": logger_name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        if self.app_name and record.name != logger_name:
            log_data["source_logger"] = record.name

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # Add extra fields
        if hasattr(record, "extra_data"):
            log_data["extra"] = record.extra_data

        return json.dumps(log_data, ensure_ascii=False)


def _build_handlers(
    *,
    numeric_level: int,
    log_format: str,
    log_file: str | None,
    app_name: str,
) -> list[logging.Handler]:
    if log_format == "json":
        formatter: logging.Formatter = JSONFormatter(app_name=app_name)
    else:
        formatter = logging.Formatter(
            "%(asctime)s - %(app_logger_name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    handlers: list[logging.Handler] = []
    for handler in (
        NonClosingStreamHandler(),
        logging.FileHandler(log_file, encoding="utf-8") if log_file else None,
    ):
        if handler is None:
            continue
        handler.setLevel(numeric_level)
        handler.setFormatter(formatter)
        handler.addFilter(AppNameFilter(app_name))
        handlers.append(handler)

    return handlers


def _configure_logger(
    *,
    name: str,
    numeric_level: int,
    handlers: Iterable[logging.Handler],
) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(numeric_level)

    for existing_handler in list(logger.handlers):
        existing_handler.close()
    logger.handlers = []

    for handler in handlers:
        logger.addHandler(handler)

    logger.propagate = False
    return logger


def setup_logging(
    log_level: str = "INFO",
    log_format: str = "text",
    log_file: str = None,
    app_name: str = "stock_verify",
) -> logging.Logger:
    """
    Setup application logging

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        log_format: Format type (json or text)
        log_file: Optional log file path
        app_name: Application name for logger

    Returns:
        Configured logger instance
    """
    # Get root logger
    logger = logging.getLogger(app_name)

    # Set level
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)

    # Keep startup/runtime output coherent across the configured app logger,
    # the legacy "stock-verify" logger, the backend.* module hierarchy,
    # and Uvicorn's server/access loggers.
    logger_names = dict.fromkeys(
        (app_name, "stock-verify", "backend", "uvicorn", "uvicorn.error", "uvicorn.access")
    )
    for logger_name in logger_names:
        if logger_name is None:
            continue
        _configure_logger(
            name=logger_name,
            numeric_level=numeric_level,
            handlers=_build_handlers(
                numeric_level=numeric_level,
                log_format=log_format,
                log_file=log_file,
                app_name=app_name,
            ),
        )

    return logger
