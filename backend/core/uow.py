import inspect
import logging
from abc import ABC, abstractmethod
from typing import Optional, Any

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
        self._txn_cm = None

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

            txn_cm = self.session.start_transaction()
            if inspect.isawaitable(txn_cm):
                txn_cm = await txn_cm
            self._txn_cm = txn_cm

            if hasattr(self._txn_cm, "__aenter__"):
                await self._txn_cm.__aenter__()
            elif hasattr(self._txn_cm, "__enter__"):
                self._txn_cm.__enter__()

        except Exception as exc:
            if _transaction_not_supported(exc):
                logger.debug(
                    "Mongo transactions unsupported on current deployment; using non-transaction path"
                )
                self.session = None
                self._txn_cm = None
                return self
            raise

        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        if self._txn_cm:
            if hasattr(self._txn_cm, "__aexit__"):
                await self._txn_cm.__aexit__(exc_type, exc_val, exc_tb)
            elif hasattr(self._txn_cm, "__exit__"):
                self._txn_cm.__exit__(exc_type, exc_val, exc_tb)
            self._txn_cm = None
            
        if self.session and hasattr(self.session, "end_session"):
            end_result = self.session.end_session()
            if inspect.isawaitable(end_result):
                await end_result
            self.session = None

    async def commit(self) -> None:
        # Pymongo/Motor context managers handle commit/abort in __exit__
        # We don't need to do anything explicit here when using the context manager
        pass

    async def rollback(self) -> None:
        if self.session and hasattr(self.session, "abort_transaction"):
            abort_result = self.session.abort_transaction()
            if inspect.isawaitable(abort_result):
                await abort_result
