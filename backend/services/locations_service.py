"""Location lookup service for warehouse and zone endpoints."""

from __future__ import annotations

import logging
from typing import Any

from backend.db.runtime import get_db
from backend.sql_server_connector import DatabaseConnectionError, DatabaseQueryError, sql_connector
from backend.utils.api_utils import sanitize_for_logging

logger = logging.getLogger(__name__)


class LocationsService:
    def __init__(
        self,
        *,
        showroom_defaults: list[dict[str, str]],
        godown_defaults: list[dict[str, str]],
    ) -> None:
        self._showroom_defaults = showroom_defaults
        self._godown_defaults = godown_defaults
        self._all_defaults = [*showroom_defaults, *godown_defaults]

    def defaults_for_zone(self, zone: str | None) -> list[dict[str, str]]:
        if not zone:
            return [dict(item) for item in self._all_defaults]

        zone_normalized = zone.lower()
        if "showroom" in zone_normalized:
            return [dict(item) for item in self._showroom_defaults]
        if "godown" in zone_normalized or "down" in zone_normalized:
            return [dict(item) for item in self._godown_defaults]
        return []

    async def get_warehouses(self, zone: str | None) -> list[dict[str, Any]]:
        defaults = self.defaults_for_zone(zone)
        try:
            if sql_connector.test_connection():
                warehouses = self._filter_sql_warehouses(sql_connector.get_all_warehouses(), zone)
                if warehouses:
                    return warehouses
        except (
            DatabaseConnectionError,
            DatabaseQueryError,
            RuntimeError,
            TypeError,
            ValueError,
        ) as exc:
            logger.warning("SQL warehouse lookup unavailable: %s", sanitize_for_logging(str(exc)))

        database = self._get_mongo_db_or_none()
        if database is None:
            logger.warning("MongoDB not initialized; returning default warehouses")
            return defaults

        mongo_warehouses = await self._fetch_mongo_warehouses(database, zone)
        if not mongo_warehouses:
            if defaults:
                return await self._seed_default_warehouses(database, defaults, zone)
            return []

        return self._sanitize_warehouse_docs(mongo_warehouses)

    def get_zones(self) -> list[dict[str, Any]]:
        try:
            if sql_connector.test_connection():
                return sql_connector.get_all_zones()
        except (
            DatabaseConnectionError,
            DatabaseQueryError,
            RuntimeError,
            TypeError,
            ValueError,
        ) as exc:
            logger.warning("SQL zone lookup unavailable: %s", sanitize_for_logging(str(exc)))

        logger.warning("SQL Server unavailable, returning default offline zones")
        return [
            {"zone_name": "Showroom", "id": "zone_showroom"},
            {"zone_name": "Godown", "id": "zone_godown"},
        ]

    def _get_mongo_db_or_none(self) -> Any | None:
        try:
            return get_db()
        except RuntimeError:
            return None

    async def _fetch_mongo_warehouses(
        self, database: Any, zone: str | None
    ) -> list[dict[str, Any]]:
        query: dict[str, Any] = {}
        if zone:
            query["zone"] = {"$regex": zone, "$options": "i"}
        return await database["warehouses"].find(query).to_list(length=50)

    async def _seed_default_warehouses(
        self,
        database: Any,
        defaults: list[dict[str, str]],
        zone: str | None,
    ) -> list[dict[str, Any]]:
        await database["warehouses"].insert_many(defaults)
        logger.info(
            "Seeded default warehouses into MongoDB for zone %s",
            sanitize_for_logging(zone or "*"),
        )
        return self._sanitize_warehouse_docs(defaults)

    @staticmethod
    def _sanitize_warehouse_docs(docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        sanitized: list[dict[str, Any]] = []
        for doc in docs:
            item = {k: v for k, v in doc.items() if k != "_id"}
            if "id" not in item and "_id" in doc:
                item["id"] = str(doc["_id"])
            sanitized.append(item)
        return sanitized

    def _filter_sql_warehouses(
        self,
        warehouses: list[dict[str, Any]],
        zone: str | None,
    ) -> list[dict[str, Any]]:
        if not zone:
            return warehouses

        zone_normalized = zone.strip().lower()
        filtered = [w for w in warehouses if zone_normalized in w.get("warehouse_name", "").lower()]
        if filtered:
            return filtered
        if "showroom" in zone_normalized or "godown" in zone_normalized:
            return self.defaults_for_zone(zone)
        return filtered
