"""Centralized optional dependency guards for runtime integrations."""

from __future__ import annotations

from types import ModuleType
from typing import Any


class DependencyUnavailable(RuntimeError):
    """Raised when an optional runtime dependency is required but unavailable."""


class _UnavailablePyodbc:
    Error = type("Error", (DependencyUnavailable,), {})
    Connection = type("Connection", (), {})

    @staticmethod
    def connect(*_args: Any, **_kwargs: Any) -> Any:
        raise DependencyUnavailable("SQL Server connector dependency pyodbc is unavailable")

    @staticmethod
    def drivers() -> list[str]:
        raise DependencyUnavailable("SQL Server connector dependency pyodbc is unavailable")


try:  # pragma: no cover - exercised only when pyodbc is installed locally
    import pyodbc as _pyodbc
except ImportError:  # pragma: no cover - depends on local platform
    _pyodbc = None  # type: ignore[assignment]


class DependencyManager:
    """Small registry for optional runtime dependencies."""

    @staticmethod
    def optional_sql_module() -> ModuleType | _UnavailablePyodbc:
        return _pyodbc if _pyodbc is not None else _UnavailablePyodbc()

    @staticmethod
    def require_sql(module: Any = None) -> ModuleType | Any:
        if module is not None and not isinstance(module, _UnavailablePyodbc):
            return module
        if _pyodbc is None:
            raise DependencyUnavailable("SQL Server connector dependency pyodbc is unavailable")
        return _pyodbc

    @staticmethod
    def sql_available() -> bool:
        return _pyodbc is not None


pyodbc: ModuleType | _UnavailablePyodbc = DependencyManager.optional_sql_module()
