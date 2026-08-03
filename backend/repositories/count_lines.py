from typing import Any

from backend.core.uow import MongoUnitOfWork
from backend.repositories.base import MongoRepository


class CountLineRepository(MongoRepository[dict[str, Any]]):
    """
    Repository for managing count line documents.
    """

    def __init__(self, uow: MongoUnitOfWork):
        super().__init__(uow, "count_lines")

    async def get_by_id(self, id: Any) -> dict[str, Any] | None:
        return await self.collection.find_one({"_id": id}, session=self.session)

    async def save(self, entity: dict[str, Any]) -> dict[str, Any]:
        """
        Inserts or updates a count line.
        """
        if "_id" in entity:
            await self.collection.replace_one(
                {"_id": entity["_id"]}, entity, upsert=True, session=self.session
            )
        else:
            result = await self.collection.insert_one(entity, session=self.session)
            entity["_id"] = result.inserted_id
        return entity

    async def find_by_session_id(self, session_id: str) -> list[dict[str, Any]]:
        cursor = self.collection.find({"session_id": session_id}, session=self.session)
        return await cursor.to_list(length=None)

    async def get_by_session_and_item(
        self, session_id: str, item_id: str, location_id: str
    ) -> dict[str, Any] | None:
        return await self.collection.find_one(
            {"session_id": session_id, "item_id": item_id, "location_id": location_id},
            session=self.session,
        )
