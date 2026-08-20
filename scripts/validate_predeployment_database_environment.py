#!/usr/bin/env python3
"""Validate production environment policy and read-only ERP connectivity.

This script never issues SQL data-definition or data-modification statements.
It prints statuses and sanitized identities only; it never prints secret values.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path
from typing import Iterable

REQUIRED_KEYS = (
    "DOMAIN",
    "CERTBOT_EMAIL",
    "DB_NAME",
    "BACKEND_IMAGE",
    "NGINX_IMAGE",
    "JWT_SECRET",
    "JWT_REFRESH_SECRET",
    "PIN_SALT",
    "MONGO_ROOT_USER",
    "MONGO_ROOT_PASSWORD",
    "REDIS_PASSWORD",
    "SQL_SERVER_HOST",
    "SQL_SERVER_PORT",
    "SQL_SERVER_DATABASE",
    "SQL_SERVER_USER",
    "SQL_SERVER_PASSWORD",
    "FORCE_HTTPS",
    "ALLOWED_HOSTS",
    "CORS_ALLOW_ORIGINS",
    "AUTO_SEED_DEFAULT_USERS",
    "AUTO_SEED_MOCK_ERP_DATA",
)
SECRET_KEYS = {
    "JWT_SECRET",
    "JWT_REFRESH_SECRET",
    "PIN_SALT",
    "MONGO_ROOT_PASSWORD",
    "REDIS_PASSWORD",
    "SQL_SERVER_PASSWORD",
}
PLACEHOLDER_RE = re.compile(
    r"CHANGE_ME|REPLACE_WITH|GENERATE_|example\.com|localhost|127\.0\.0\.1|YOUR_",
    re.IGNORECASE,
)


def load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        values[key] = value
    return values


def status_for(key: str, value: str | None) -> str:
    if not value:
        return "MISSING"
    if PLACEHOLDER_RE.search(value):
        return "INVALID"
    if key == "FORCE_HTTPS" and value.lower() != "true":
        return "INVALID"
    if key in {"AUTO_SEED_DEFAULT_USERS", "AUTO_SEED_MOCK_ERP_DATA"} and value.lower() != "false":
        return "INVALID"
    if key in {"ALLOWED_HOSTS", "CORS_ALLOW_ORIGINS"} and "*" in value:
        return "INVALID"
    if key in {"JWT_SECRET", "JWT_REFRESH_SECRET", "PIN_SALT"} and len(value) < 32:
        return "INVALID"
    return "PRESENT"


def print_environment_checks(values: dict[str, str]) -> list[str]:
    failures: list[str] = []
    print("ENVIRONMENT_CHECKS")
    for key in REQUIRED_KEYS:
        result = status_for(key, values.get(key))
        print(f"{key}={result}")
        if result != "PRESENT":
            failures.append(key)
    jwt = values.get("JWT_SECRET")
    refresh = values.get("JWT_REFRESH_SECRET")
    if jwt and refresh and jwt == refresh:
        print("JWT_SECRET_PAIR=INVALID")
        failures.append("JWT_SECRET_PAIR")
    else:
        print("JWT_SECRET_PAIR=PASS")
    return failures


def validate_sql(values: dict[str, str], timeout: int) -> bool:
    try:
        import pyodbc  # type: ignore
    except ImportError:
        print("SQL_DRIVER=UNAVAILABLE")
        return False

    host = values.get("SQL_SERVER_HOST")
    port = values.get("SQL_SERVER_PORT", "1433")
    database = values.get("SQL_SERVER_DATABASE")
    user = values.get("SQL_SERVER_USER")
    password = values.get("SQL_SERVER_PASSWORD")
    if not host or not database:
        print("SQL_CONNECTION=NOT_RUN_MISSING_CONFIGURATION")
        return False
    if not user or not password:
        print("SQL_CONNECTION=NOT_RUN_MISSING_CREDENTIALS")
        return False

    drivers = [d for d in pyodbc.drivers() if "ODBC Driver" in d and "SQL Server" in d]
    if not drivers:
        print("SQL_DRIVER=UNAVAILABLE")
        return False
    driver = max(drivers)
    connection_string = (
        f"DRIVER={{{driver}}};SERVER={host},{port};DATABASE={database};"
        f"UID={user};PWD={password};Encrypt=yes;TrustServerCertificate=yes;"
        f"Connection Timeout={timeout};"
    )
    try:
        with pyodbc.connect(connection_string, readonly=True, autocommit=True) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT DB_NAME(), SUSER_SNAME(), "
                    "HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CONNECT')"
                )
                db_name, login_name, can_connect = cursor.fetchone()
                cursor.execute(
                    "SELECT TOP (1) TABLE_SCHEMA, TABLE_NAME "
                    "FROM INFORMATION_SCHEMA.TABLES "
                    "ORDER BY TABLE_SCHEMA, TABLE_NAME"
                )
                sample = cursor.fetchone()
                print("SQL_CONNECTION=PASS")
                print(f"SQL_DATABASE_IDENTITY={db_name}")
                print(f"SQL_LOGIN_IDENTITY={login_name}")
                print(f"SQL_CONNECT_PERMISSION={can_connect}")
                print("SQL_READ_QUERY=PASS")
                print(f"SQL_METADATA_SAMPLE={'YES' if sample else 'NO'}")
                return str(db_name).upper() == database.upper() and bool(can_connect)
    except Exception as exc:  # sanitized, first-line diagnostic only
        print("SQL_CONNECTION=FAIL")
        print(f"SQL_ERROR_TYPE={type(exc).__name__}")
        # Do not print driver exception text: some ODBC drivers echo the
        # connection string, which could disclose the SQL password.
        return False


def resolve_env_file(path: Path) -> Path:
    """Resolve an env file without allowing traversal outside the worktree."""
    worktree = Path.cwd().resolve()
    candidate = path.expanduser()
    resolved = (worktree / candidate).resolve() if not candidate.is_absolute() else candidate.resolve()
    if resolved != worktree and worktree not in resolved.parents:
        raise ValueError("--env-file must be inside the current worktree")
    return resolved

def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=Path(".env.prod"))
    parser.add_argument("--sql-timeout", type=int, default=8)
    args = parser.parse_args(argv)

    values = load_env_file(resolve_env_file(args.env_file))
    for key in REQUIRED_KEYS:
        if key not in values and os.getenv(key):
            values[key] = os.environ[key]  # environment overrides file for secret managers

    failures = print_environment_checks(values)
    sql_ok = validate_sql(values, args.sql_timeout)
    print("SUMMARY")
    print(f"ENVIRONMENT_POLICY={'PASS' if not failures else 'FAIL'}")
    print(f"SQL_READ_ONLY_CONNECTIVITY={'PASS' if sql_ok else 'FAIL'}")
    print(f"OVERALL={'PASS' if not failures and sql_ok else 'FAIL'}")
    return 0 if not failures and sql_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
