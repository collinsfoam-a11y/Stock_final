import inspect
import logging
from abc import ABC, abstractmethod
from typing import Any

logger = logging.getLogger(__name__)

class UnitOfWork(ABC):
    """
    Abstract Unit of Work for managing transactions across multiple repositories.
    """

    @abstractmethod
    async def __aenter__(self) -> "UnitOfWork":
        pass

    @abstractmethod
    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        pass

    @abstractmethod
    async def commit(self) -> None:
        pass

    @abstractmethod
    async def rollback(self) -> None:
        pass


async def _client_supports_transactions(client: Any) -> bool:
    admin_db = getattr(client, "admin", None)
    command = getattr(admin_db, "command", None)
    if command is None:
        return True

    try:
        hello_result = command("hello")
        hello = await hello_result if inspect.isawaitable(hello_result) else hello_result
    except Exception:
        return True

    if not isinstance(hello, dict):
        return True

    if hello.get("msg") == "isdbgrid":
        return True
    if hello.get("setName"):
        return True
    return False

def _transaction_not_supported(exc: Exception) -> bool:
    from pymongo.errors import OperationFailure
    if isinstance(exc, OperationFailure) and getattr(exc, "code", None) == 20:
        return True
    message = str(exc)
    return "Transaction numbers are only allowed on a replica set member or mongos" in message


class MongoUnitOfWork(UnitOfWork):
    """
    MongoDB implementation of the Unit of Work pattern using multi-document transactions.
    If the cluster doesn't support transactions (e.g., standalone), the transaction commands
    will fallback gracefully or raise depending on driver config. Our replica-set guard 
    ensures production always supports transactions.
    """

    def __init__(self, client: Any):
        self.client = client
        self.session = None
        self._committed = False

    async def __aenter__(self) -> "MongoUnitOfWork":
        if self.client is None or not hasattr(self.client, "start_session"):
            return self
        if not await _client_supports_transactions(self.client):
            return self

        started = self.client.start_session()
        self.session = await started if inspect.isawaitable(started) else started

        try:
            if not hasattr(self.session, "start_transaction"):
                return self

            # Start transaction explicitly, without using the context manager.
            # This requires explicit commit/abort.
            self.session.start_transaction()
            self._committed = False

        except Exception as exc:
            if _transaction_not_supported(exc):
                logger.debug(
                    "Mongo transactions unsupported on current deployment; using non-transaction path"
                )
                if self.session and hasattr(self.session, "end_session"):
                    end_result = self.session.end_session()
                    if inspect.isawaitable(end_result):
                        await end_result
                self.session = None
                return self
            raise

        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        if self.session:
            # If we started a transaction and it hasn't been committed, roll it back
            if hasattr(self.session, "in_transaction") and self.session.in_transaction and not self._committed:
                try:
                    await self.rollback()
                except Exception as e:
                    logger.warning("Error rolling back transaction in __aexit__: %s", e)

            if hasattr(self.session, "end_session"):
                end_result = self.session.end_session()
                if inspect.isawaitable(end_result):
                    await end_result
            self.session = None

    async def commit(self) -> None:
        if self.session and hasattr(self.session, "commit_transaction"):
            commit_result = self.session.commit_transaction()
            if inspect.isawaitable(commit_result):
                await commit_result
            self._committed = True

    async def rollback(self) -> None:
        if self.session and hasattr(self.session, "abort_transaction"):
            abort_result = self.session.abort_transaction()
            if inspect.isawaitable(abort_result):
                await abort_result
            self._committed = False
