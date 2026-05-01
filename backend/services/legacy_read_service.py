"""Flags-off Mongo read service boundary.

Keep methods thin during extraction: move existing API query logic here first,
then optimize in later passes.
"""

from __future__ import annotations

from typing import Any

from backend.db.runtime import get_db


class LegacyReadService:
    def __init__(self, db: Any) -> None:
        self.db = db


def get_legacy_read_service() -> LegacyReadService:
    return LegacyReadService(get_db())
