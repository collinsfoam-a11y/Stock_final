from typing import Generic, TypeVar, Optional, Any
from abc import ABC, abstractmethod

T = TypeVar("T")

class BaseRepository(Generic[T], ABC):
    """
    Abstract Base Repository interface.
    """

    @abstractmethod
    async def get_by_id(self, id: Any) -> Optional[T]:
        pass

    @abstractmethod
    async def save(self, entity: T) -> T:
        pass


class MongoRepository(BaseRepository[T]):
    """
    Base Repository for MongoDB, requiring a unit of work (session).
    """
    def __init__(self, uow: Any, collection_name: str):
        self.uow = uow
        self.collection_name = collection_name

    @property
    def collection(self):
        from backend.config import settings
        # In tests, self.uow.client might be an InMemoryDatabase (acting as DB)
        # In prod, self.uow.client might be an AsyncIOMotorClient
        client = self.uow.client
        
        if "InMemoryDatabase" in type(client).__name__ or "Mock" in type(client).__name__:
            return getattr(client, self.collection_name)

        if hasattr(client, "__getitem__") and not hasattr(client, "count_lines"):
            try:
                db = client[settings.DB_NAME]
                return db[self.collection_name]
            except (TypeError, KeyError, AttributeError):
                pass
        
        # Fallback for InMemoryDatabase or if client is already a DB
        return getattr(client, self.collection_name)

    @property
    def session(self):
        return self.uow.session
