import pytest

from backend.services import dependency_manager
from backend.services.dependency_manager import DependencyUnavailable
from backend.sql_server_connector import SQLServerConnector
from backend.utils.db_connection import SQLServerConnectionBuilder


def test_missing_pyodbc_dependency_is_controlled(monkeypatch):
    monkeypatch.setattr(dependency_manager, "_pyodbc", None)

    assert dependency_manager.has_sql() is False
    with pytest.raises(DependencyUnavailable, match="pyodbc is unavailable"):
        dependency_manager.require_sql()


def test_sql_builder_raises_controlled_error_without_pyodbc(monkeypatch):
    from backend.utils import db_connection

    monkeypatch.setattr(dependency_manager, "_pyodbc", None)
    monkeypatch.setattr(
        db_connection,
        "pyodbc",
        dependency_manager.DependencyManager.optional_sql_module(),
    )
    SQLServerConnectionBuilder._detected_driver = None

    with pytest.raises(DependencyUnavailable, match="pyodbc is unavailable"):
        SQLServerConnectionBuilder.build_connection_string(
            host="localhost",
            database="stock_verification",
        )


def test_sql_connector_connect_raises_controlled_error_without_pyodbc(monkeypatch):
    import backend.sql_server_connector as sql_server_connector

    monkeypatch.setattr(dependency_manager, "_pyodbc", None)
    monkeypatch.setattr(
        sql_server_connector,
        "pyodbc",
        dependency_manager.DependencyManager.optional_sql_module(),
    )

    with pytest.raises(DependencyUnavailable, match="SQL not available"):
        SQLServerConnector().connect(
            host="localhost",
            port=1433,
            database="stock_verification",
        )
