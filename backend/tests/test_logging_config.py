import io
import json
import logging

from backend.utils.logging_config import JSONFormatter, NonClosingStreamHandler, setup_logging


def test_non_closing_stream_handler_keeps_stream_after_close():
    stream = io.StringIO()
    handler = NonClosingStreamHandler(stream)
    handler.setFormatter(logging.Formatter("%(message)s"))

    handler.emit(
        logging.makeLogRecord({"msg": "first", "levelno": logging.INFO, "levelname": "INFO"})
    )
    handler.close()
    handler.emit(
        logging.makeLogRecord({"msg": "second", "levelno": logging.INFO, "levelname": "INFO"})
    )

    assert handler.stream is stream
    assert stream.getvalue().splitlines() == ["first", "second"]


def test_setup_logging_can_reconfigure_same_logger_without_breaking_streams():
    logger_name = "test-app-logger"

    logger = setup_logging(log_level="INFO", log_format="text", log_file=None, app_name=logger_name)
    logger.info("first message")

    logger = setup_logging(log_level="INFO", log_format="text", log_file=None, app_name=logger_name)
    logger.info("second message")

    assert logger.handlers
    assert all(getattr(handler, "stream", None) is not None for handler in logger.handlers)

    backend_logger = logging.getLogger("backend")
    legacy_logger = logging.getLogger("stock-verify")
    uvicorn_access_logger = logging.getLogger("uvicorn.access")

    assert backend_logger.handlers
    assert legacy_logger.handlers
    assert uvicorn_access_logger.handlers


def test_json_formatter_normalizes_logger_name_but_preserves_source_logger():
    formatter = JSONFormatter(app_name="Stock Count API")
    record = logging.makeLogRecord(
        {
            "name": "backend.utils.tracing",
            "msg": "Tracing is disabled",
            "levelno": logging.INFO,
            "levelname": "INFO",
            "pathname": __file__,
            "lineno": 42,
            "func": "test_func",
        }
    )

    payload = json.loads(formatter.format(record))

    assert payload["logger"] == "Stock Count API"
    assert payload["source_logger"] == "backend.utils.tracing"
    assert payload["message"] == "Tracing is disabled"
