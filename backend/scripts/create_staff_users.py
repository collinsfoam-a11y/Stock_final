import argparse
import asyncio
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

logger = logging.getLogger(__name__)

DEFAULT_USERS = ("staff2", "staff3", "staff4", "staff5")
DEFAULT_PASSWORD_ENV = "STAFF_PASSWORD"


def _parse_usernames(value: str | None) -> list[str]:
    raw_usernames = value.split(",") if value else list(DEFAULT_USERS)
    usernames: list[str] = []
    seen: set[str] = set()

    for raw_username in raw_usernames:
        username = raw_username.strip()
        if not username:
            continue
        if username in seen:
            continue
        usernames.append(username)
        seen.add(username)

    if not usernames:
        raise ValueError("At least one username is required")

    return usernames


def _build_user_doc(username: str, hashed_password: str) -> dict[str, Any]:
    suffix = username[-1] if username else "0"
    return {
        "username": username,
        "hashed_password": hashed_password,
        "full_name": f"Staff User {suffix}",
        "role": "staff",
        "employee_id": f"EMP{suffix}",
        "phone": f"987654321{suffix}",
        "is_active": True,
        "permissions": [],
        "created_at": datetime.now(timezone.utc),
    }


def _safe_log_value(value: Any, *, max_length: int = 50) -> str:
    from backend.utils.api_utils import sanitize_for_logging

    return sanitize_for_logging("" if value is None else str(value), max_length=max_length)


async def create_users(
    db: Any,
    usernames: Sequence[str],
    password: str | None,
    *,
    dry_run: bool = True,
) -> dict[str, Any]:
    if not dry_run and not password:
        raise ValueError(f"{DEFAULT_PASSWORD_ENV} is required when running with --execute")

    normalized_usernames = _parse_usernames(",".join(usernames))
    hashed_password = None
    if not dry_run:
        from backend.utils.auth_utils import get_password_hash

        hashed_password = get_password_hash(str(password))

    stats: dict[str, Any] = {
        "mode": "dry-run" if dry_run else "execute",
        "requested": len(normalized_usernames),
        "existing": 0,
        "would_create": 0,
        "created": 0,
        "users": [],
    }

    for username in normalized_usernames:
        existing_user = await db.users.find_one({"username": username})
        if existing_user:
            stats["existing"] += 1
            stats["users"].append({"username": username, "action": "exists"})
            logger.info("User '%s' already exists. Skipping.", _safe_log_value(username))
            continue

        stats["would_create"] += 1
        if dry_run:
            stats["users"].append({"username": username, "action": "would_create"})
            logger.info("Dry-run: would create staff user '%s'.", _safe_log_value(username))
            continue

        user_doc = _build_user_doc(username, str(hashed_password))
        await db.users.insert_one(user_doc)
        stats["created"] += 1
        stats["users"].append({"username": username, "action": "created"})
        logger.info("Created staff user '%s'.", _safe_log_value(username))

    return stats


async def _run(args: argparse.Namespace) -> dict[str, Any]:
    from backend.config import settings
    from backend.db.runtime import lifespan_db

    usernames = _parse_usernames(args.users)
    password = os.environ.get(args.password_env)

    if args.execute and not password:
        raise RuntimeError(
            f"Set {args.password_env} before running with --execute. "
            "Do not pass staff passwords on the command line."
        )

    logger.info(
        "Connecting to MongoDB database '%s'.",
        _safe_log_value(settings.DB_NAME),
    )
    async with lifespan_db(settings.MONGO_URL, settings.DB_NAME) as (_client, db):
        return await create_users(
            db,
            usernames,
            password,
            dry_run=not args.execute,
        )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Create default staff users. Runs in dry-run mode unless --execute is provided."
        )
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help=(
            "Create users in MongoDB. Requires a prior approval-log entry and "
            f"{DEFAULT_PASSWORD_ENV} in the environment."
        ),
    )
    parser.add_argument(
        "--users",
        default=",".join(DEFAULT_USERS),
        help="Comma-separated usernames to create.",
    )
    parser.add_argument(
        "--password-env",
        default=DEFAULT_PASSWORD_ENV,
        help="Environment variable containing the staff password.",
    )
    return parser


def _print_summary(stats: dict[str, Any]) -> None:
    print("\n=== Staff User Creation Results ===")
    print(f"Mode: {stats['mode']}")
    print(f"Requested: {stats['requested']}")
    print(f"Existing: {stats['existing']}")
    print(f"Would create: {stats['would_create']}")
    print(f"Created: {stats['created']}")
    for user in stats["users"]:
        print(f"  - {user['username']}: {user['action']}")


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    args = _build_parser().parse_args()
    stats = asyncio.run(_run(args))
    _print_summary(stats)

    if not args.execute:
        print(
            "\nDry-run only. Before running with --execute, log approval with "
            "scripts/agent_approval_log.py and set STAFF_PASSWORD."
        )


if __name__ == "__main__":
    main()
