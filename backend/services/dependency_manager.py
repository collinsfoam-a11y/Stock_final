"""Centralized optional dependency guards for runtime integrations."""

from __future__ import annotations

from functools import wraps
from importlib import import_module
from importlib.util import find_spec
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


_OPTIONAL_IMPORT_NAMES = {
    "pydantic-settings": "pydantic_settings",
}


def _import_name(dep_name: str) -> str:
    return _OPTIONAL_IMPORT_NAMES.get(dep_name, dep_name).replace("-", "_")


def _is_patched_unavailable_sql(module: Any) -> bool:
    """Allow tests to patch the unavailable pyodbc shim explicitly."""
    return isinstance(module, _UnavailablePyodbc) and bool(
        {"connect", "drivers"} & set(getattr(module, "__dict__", {}))
    )


class DependencyManager:
    """Small registry for optional runtime dependencies."""

    @staticmethod
    def optional_sql_module() -> ModuleType | _UnavailablePyodbc:
        return _pyodbc if _pyodbc is not None else _UnavailablePyodbc()

    @staticmethod
    def require_sql(module: Any = None) -> ModuleType | Any:
        if module is not None and (
            not isinstance(module, _UnavailablePyodbc) or _is_patched_unavailable_sql(module)
        ):
            return module
        if _pyodbc is None:
            raise DependencyUnavailable("SQL Server connector dependency pyodbc is unavailable")
        return _pyodbc

    @staticmethod
    def has_sql() -> bool:
        return _pyodbc is not None

    @staticmethod
    def sql_available() -> bool:
        return DependencyManager.has_sql()

    @staticmethod
    def has_optional(dep_name: str) -> bool:
        if dep_name in {"sql", "pyodbc"}:
            return DependencyManager.has_sql()
        try:
            return find_spec(_import_name(dep_name)) is not None
        except (ImportError, ValueError):
            return False

    @staticmethod
    def require_optional(dep_name: str) -> ModuleType:
        if dep_name in {"sql", "pyodbc"}:
            return DependencyManager.require_sql()
        try:
            return import_module(_import_name(dep_name))
        except ImportError as exc:
            raise DependencyUnavailable(f"Optional dependency {dep_name} is unavailable") from exc

    @staticmethod
    def require_optional_attr(module_name: str, attr_name: str) -> Any:
        module = DependencyManager.require_optional(module_name)
        try:
            return getattr(module, attr_name)
        except AttributeError as exc:
            raise DependencyUnavailable(
                f"Optional dependency {module_name}.{attr_name} is unavailable"
            ) from exc


pyodbc: ModuleType | _UnavailablePyodbc = DependencyManager.optional_sql_module()


def has_sql() -> bool:
    return DependencyManager.has_sql()


def require_sql() -> ModuleType:
    return DependencyManager.require_sql()


def has_optional(dep_name: str) -> bool:
    return DependencyManager.has_optional(dep_name)


def require_optional(dep_name: str) -> ModuleType:
    return DependencyManager.require_optional(dep_name)


def require_optional_attr(module_name: str, attr_name: str) -> Any:
    return DependencyManager.require_optional_attr(module_name, attr_name)


def optional_stop_after_attempt(*args: Any, **kwargs: Any) -> Any:
    if not has_optional("tenacity"):
        return None
    return require_optional_attr("tenacity", "stop_after_attempt")(*args, **kwargs)


def optional_wait_exponential(*args: Any, **kwargs: Any) -> Any:
    if not has_optional("tenacity"):
        return None
    return require_optional_attr("tenacity", "wait_exponential")(*args, **kwargs)


def optional_retry(*args: Any, **kwargs: Any) -> Any:
    if has_optional("tenacity"):
        return require_optional_attr("tenacity", "retry")(*args, **kwargs)

    def decorator(func: Any) -> Any:
        @wraps(func)
        def wrapper(*func_args: Any, **func_kwargs: Any) -> Any:
            raise DependencyUnavailable("Optional dependency tenacity is unavailable")

        return wrapper

    return decorator
