"""
SQL Verification Service - Verifies item quantities from SQL Server
Implements business logic requirement: Item selection triggers SQL qty read + Mongo writeback
"""

import asyncio
import logging
import math
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from backend.sql_server_connector import (
    DatabaseConnectionError,
    DatabaseQueryError,
    ERPQueryParameterError,
    ERPReadOnlyViolation,
    SQLServerConnector,
)
from backend.core.database import db

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SQLErrorDefinition:
    message: str
    status_code: int
    box_status: str | None = None
    status: str | None = None


DEFAULT_SQL_ERROR = SQLErrorDefinition(
    message="Verification failed due to an internal error.",
    status_code=500,
)


SQL_ERROR_CATALOG: dict[str, SQLErrorDefinition] = {
    "SQL_CONNECTION_ERROR": SQLErrorDefinition(
        message="ERP system is temporarily unavailable. Please try again later.",
        status_code=503,
        box_status="SQL_FAILURE",
    ),
    "ERP_READ_ONLY_VIOLATION": SQLErrorDefinition(
        message="Write operation blocked on ERP.",
        status_code=400,
    ),
    "ERP_QUERY_PARAMETER_ERROR": SQLErrorDefinition(
        message="ERP query blocked due to unsafe parameters.",
        status_code=400,
    ),
    "ERP_NULL_RESULT": SQLErrorDefinition(
        message="ERP returned no quantity for this item.",
        status_code=500,
    ),
    "ERP_AMBIGUOUS_RESULT": SQLErrorDefinition(
        message="ERP returned ambiguous quantity for this item.",
        status_code=500,
    ),
    "ERP_INVALID_RESULT": SQLErrorDefinition(
        message="ERP returned invalid quantity for this item.",
        status_code=500,
    ),
    "ERP_QUERY_ERROR": SQLErrorDefinition(
        message="ERP query failed. Please try again later.",
        status_code=500,
    ),
    "SQL_NEGATIVE_QTY": SQLErrorDefinition(
        message="Governance rejection: negative SQL quantity",
        status_code=422,
    ),
    "MONGO_NON_NUMERIC_QTY": SQLErrorDefinition(
        message="Governance rejection: non-numeric Mongo quantity",
        status_code=422,
    ),
    "MONGO_NON_FINITE_QTY": SQLErrorDefinition(
        message="Governance rejection: non-finite Mongo quantity",
        status_code=422,
    ),
    "SQL_VARIANCE_THRESHOLD": SQLErrorDefinition(
        message="Variance exceeds governance threshold",
        status_code=422,
        status="ERROR",
    ),
    "VERIFICATION_CONFLICT": SQLErrorDefinition(
        message="State conflict: data changed during verification",
        status_code=409,
        status="conflict",
    ),
    "ITEM_LOST": SQLErrorDefinition(
        message="Item lost during update",
        status_code=404,
    ),
    "ITEM_NOT_FOUND": SQLErrorDefinition(
        message="Item not found in MongoDB",
        status_code=404,
    ),
    "VERIFICATION_INTERNAL_ERROR": SQLErrorDefinition(
        message="Verification failed due to an internal error.",
        status_code=500,
    ),
    "SQL_BATCH_FAILURE": SQLErrorDefinition(
        message="Batch verification failed due to an internal error.",
        status_code=500,
    ),
    "ERP_AMBIGUOUS_BATCH_RESULT": SQLErrorDefinition(
        message="ERP batch returned incomplete results.",
        status_code=500,
    ),
    "ERP_INVALID_BATCH_RESULT": SQLErrorDefinition(
        message="ERP batch returned invalid quantity results.",
        status_code=500,
    ),
}


class SQLVerificationError(Exception):
    """Base exception for SQL verification failures."""


class SQLNullResultError(SQLVerificationError):
    """Raised when SQL result is empty or null."""


class SQLAmbiguousResultError(SQLVerificationError):
    """Raised when SQL result returns multiple rows."""


class SQLInvalidNumericError(SQLVerificationError):
    """Raised when SQL result is non-numeric or non-finite."""


class SQLVerificationService:
    """Service for verifying item quantities against SQL Server"""

    def __init__(self):
        self.sql_connector = SQLServerConnector()

    def _error_response(
        self,
        *,
        error_code: str,
        item_code: str,
        message: Optional[str] = None,
        status_code: Optional[int] = None,
        context: Optional[dict[str, Any]] = None,
        box_status: Optional[str] = None,
        status: Optional[str] = None,
    ) -> Dict[str, Any]:
        error_definition = SQL_ERROR_CATALOG.get(error_code, DEFAULT_SQL_ERROR)
        resolved_message = (
            message if message is not None else error_definition.message
        )
        resolved_status_code = (
            status_code if status_code is not None else error_definition.status_code
        )
        resolved_box_status = (
            box_status if box_status is not None else error_definition.box_status
        )
        resolved_status = status if status is not None else error_definition.status

        payload: Dict[str, Any] = {
            "success": False,
            "error_code": error_code,
            "message": resolved_message,
            "status_code": resolved_status_code,
            "item_code": item_code,
            "error": resolved_message,
        }
        if context:
            payload["context"] = context
        if resolved_box_status:
            payload["box_status"] = resolved_box_status
        if resolved_status:
            payload["status"] = resolved_status
        return payload

    async def _record_failed_verification(
        self,
        *,
        item_code: str,
        error_code: str,
        latency_ms: Optional[float],
        exc: Exception,
        log_prefix: str,
    ) -> Dict[str, Any]:
        logger.error("%s for %s: %s", log_prefix, item_code, exc)
        error_info = self._error_response(error_code=error_code, item_code=item_code)
        await self._record_governance_event(
            item_code=item_code,
            sql_qty=None,
            mongo_qty=None,
            variance=None,
            latency_ms=latency_ms,
            seq=None,
            status="FAILED",
            error_info=error_info,
        )
        return error_info

    @staticmethod
    def _unexpected_verification_error_code(exc: Exception) -> str:
        error_text = str(exc).lower()
        if any(term in error_text for term in ["connection", "sql server", "timeout", "reconnect"]):
            return "SQL_CONNECTION_ERROR"
        return "VERIFICATION_INTERNAL_ERROR"

    def _verification_fail_fast_details(self, exc: Exception) -> tuple[str, str]:
        if isinstance(exc, DatabaseConnectionError):
            return "SQL_CONNECTION_ERROR", "FAIL-FAST: SQL connection failed"
        if isinstance(exc, ERPReadOnlyViolation):
            return "ERP_READ_ONLY_VIOLATION", "FAIL-FAST: ERP read-only violation"
        if isinstance(exc, ERPQueryParameterError):
            return "ERP_QUERY_PARAMETER_ERROR", "FAIL-FAST: ERP parameterization error"
        if isinstance(exc, SQLNullResultError):
            return "ERP_NULL_RESULT", "ERP null result"
        if isinstance(exc, SQLAmbiguousResultError):
            return "ERP_AMBIGUOUS_RESULT", "ERP ambiguous result"
        if isinstance(exc, SQLInvalidNumericError):
            return "ERP_INVALID_RESULT", "ERP invalid numeric result"
        if isinstance(exc, DatabaseQueryError):
            return "ERP_QUERY_ERROR", "ERP query failed"
        return self._unexpected_verification_error_code(exc), "Governance Error verifying"

    async def _record_governance_event(
        self,
        *,
        item_code: str,
        sql_qty: Optional[float],
        mongo_qty: Optional[float],
        variance: Optional[float],
        latency_ms: Optional[float],
        seq: Optional[int],
        status: str,
        error_info: Optional[Dict[str, Any]] = None,
    ) -> None:
        from backend.config_governance import GOVERNANCE_FINGERPRINT

        event: Dict[str, Any] = {
            "item_code": item_code,
            "sql_qty": sql_qty,
            "mongo_qty": mongo_qty,
            "variance": variance,
            "latency_ms": latency_ms,
            "seq": seq,
            "status": status,
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None),
            "policy": GOVERNANCE_FINGERPRINT,
        }
        if error_info:
            event["error"] = {
                "code": error_info.get("error_code"),
                "message": error_info.get("message"),
                "context": error_info.get("context"),
            }
        try:
            await db.governance_events.insert_one(event)
        except Exception as e:
            logger.error("Governance event insert failed for %s: %s", item_code, e)

    def _validate_sql_qty_or_error(self, item_code: str, sql_qty: float) -> Optional[Dict[str, Any]]:
        if isinstance(sql_qty, bool) or not isinstance(sql_qty, (int, float)):
            raise SQLInvalidNumericError("Non-numeric SQL result")
        if not math.isfinite(sql_qty):
            raise SQLInvalidNumericError("Non-finite SQL result")
        if sql_qty >= 0:
            return None

        logger.error("CRITICAL: Negative SQL quantity rejected: %s for %s", sql_qty, item_code)
        return self._error_response(error_code="SQL_NEGATIVE_QTY", item_code=item_code)

    def _warn_high_latency_if_needed(self, item_code: str, latency_ms: float, max_latency_ms: float) -> None:
        if latency_ms <= max_latency_ms:
            return
        logger.warning("PERFORMANCE: SQL Latency High (%.2fms) for %s", latency_ms, item_code)

    async def _load_mongo_item_snapshot(self, item_code: str) -> Optional[dict[str, Any]]:
        mongo_item = await db.erp_items.find_one({"$or": [{"item_code": item_code}, {"barcode": item_code}]})
        if mongo_item:
            return mongo_item
        logger.warning("Item %s not found in Mongo Ledger", item_code)
        return None

    def _normalize_mongo_qty_or_error(
        self, item_code: str, mongo_qty: Any
    ) -> tuple[Optional[float], Optional[Dict[str, Any]]]:
        normalized_qty = 0 if mongo_qty is None else mongo_qty
        if hasattr(normalized_qty, "to_decimal"):
            try:
                normalized_qty = float(normalized_qty.to_decimal())
            except Exception:
                logger.error(
                    f"CRITICAL: Non-numeric Mongo quantity rejected: {normalized_qty} for {item_code}"
                )
                return None, self._error_response(
                    error_code="MONGO_NON_NUMERIC_QTY",
                    item_code=item_code,
                )

        if isinstance(normalized_qty, bool) or not isinstance(normalized_qty, (int, float)):
            logger.error(
                f"CRITICAL: Non-numeric Mongo quantity rejected: {normalized_qty} for {item_code}"
            )
            return None, self._error_response(
                error_code="MONGO_NON_NUMERIC_QTY",
                item_code=item_code,
            )

        if not math.isfinite(normalized_qty):
            logger.error(
                f"CRITICAL: Non-finite Mongo quantity rejected: {normalized_qty} for {item_code}"
            )
            return None, self._error_response(
                error_code="MONGO_NON_FINITE_QTY",
                item_code=item_code,
            )

        return float(normalized_qty), None

    def _variance_threshold_error(
        self, *, item_code: str, variance: float, max_variance: float, strict_mode: bool
    ) -> Optional[Dict[str, Any]]:
        if abs(variance) <= max_variance:
            return None

        logger.warning("VARIANCE: Large variance detected (%s) for %s", variance, item_code)
        if not strict_mode:
            return None

        return self._error_response(
            error_code="SQL_VARIANCE_THRESHOLD",
            item_code=item_code,
        )

    def _build_sql_update_data(
        self,
        *,
        sql_qty: float,
        mongo_qty: float,
        variance: float,
        latency_ms: float,
        new_seq: int,
        status: str,
    ) -> dict[str, Any]:
        return {
            "sql_verified_qty": sql_qty,
            "last_sql_verified_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "variance": variance,
            "mongo_cached_qty_previous": mongo_qty,
            "sql_qty_mismatch_flag": variance != 0,
            "sql_verification_status": status,
            "sql_verification_seq": new_seq,
            "sql_verification_source": "SQL_SERVER",
            "sql_verification_latency_ms": round(latency_ms, 2),
        }

    async def _handle_update_conflict_or_loss(
        self,
        *,
        item_code: str,
        sql_qty: float,
        mongo_item: dict[str, Any],
        mongo_qty: float,
    ) -> Dict[str, Any]:
        check_item = await db.erp_items.find_one({"_id": mongo_item["_id"]})
        if check_item and check_item.get("stock_qty") != mongo_qty:
            logger.warning(
                f"CONFLICT: Mongo state changed during verification for {item_code}. Forking record."
            )
            await db.verification_conflicts.insert_one(
                {
                    "original_item_id": mongo_item["_id"],
                    "item_code": item_code,
                    "conflict_timestamp": datetime.now(timezone.utc).replace(tzinfo=None),
                    "attempted_sql_qty": sql_qty,
                    "mongo_qty_at_read": mongo_qty,
                    "mongo_qty_current": check_item.get("stock_qty"),
                    "type": "VERIFICATION_CONFLICT_FORK",
                }
            )
            return {
                "error": self._error_response(
                    error_code="VERIFICATION_CONFLICT",
                    item_code=item_code,
                ),
                "event_status": "CONFLICT",
            }

        logger.warning("No document updated (Item deleted?): %s", item_code)
        return {
            "error": self._error_response(error_code="ITEM_LOST", item_code=item_code),
            "event_status": "FAILED",
        }

    @staticmethod
    def _verification_settings() -> tuple[bool, float, float]:
        from backend.config_governance import (
            SQL_VERIFY_STRICT,
            SQL_MAX_VARIANCE,
            SQL_MAX_LATENCY_MS,
        )

        return SQL_VERIFY_STRICT, SQL_MAX_VARIANCE, SQL_MAX_LATENCY_MS

    async def _prepare_verification_context(
        self,
        *,
        item_code: str,
        sql_qty: float,
        latency_ms: float,
    ) -> tuple[
        Optional[dict[str, Any]],
        Optional[float],
        Optional[float],
        Optional[int],
        Optional[Dict[str, Any]],
    ]:
        strict_mode, max_variance, max_latency_ms = self._verification_settings()

        self._warn_high_latency_if_needed(item_code, latency_ms, max_latency_ms)
        mongo_item = await self._load_mongo_item_snapshot(item_code)
        if not mongo_item:
            return (
                None,
                None,
                None,
                None,
                self._error_response(error_code="ITEM_NOT_FOUND", item_code=item_code),
            )

        mongo_qty, mongo_qty_error = self._normalize_mongo_qty_or_error(
            item_code,
            mongo_item.get("stock_qty", 0),
        )
        if mongo_qty_error:
            return None, None, None, None, mongo_qty_error

        variance = sql_qty - mongo_qty
        threshold_error = self._variance_threshold_error(
            item_code=item_code,
            variance=variance,
            max_variance=max_variance,
            strict_mode=strict_mode,
        )
        if threshold_error:
            return None, mongo_qty, variance, None, threshold_error

        current_seq = int(mongo_item.get("sql_verification_seq", 0) or 0)
        return mongo_item, mongo_qty, variance, current_seq, None

    @staticmethod
    def _build_verification_success_response(
        *,
        item_code: str,
        sql_qty: float,
        mongo_qty: float,
        variance: float,
        verified_at: datetime,
        seq: Optional[int],
        latency_ms: float,
    ) -> Dict[str, Any]:
        return {
            "success": True,
            "item_code": item_code,
            "sql_qty": sql_qty,
            "mongo_qty": mongo_qty,
            "variance": variance,
            "verified_at": verified_at,
            "mismatch": variance != 0,
            "seq": seq,
            "latency_ms": latency_ms,
        }

    async def _apply_sql_verification_update(
        self,
        *,
        item_code: str,
        sql_qty: float,
        mongo_item: dict[str, Any],
        mongo_qty: float,
        variance: float,
        latency_ms: float,
        current_seq: int,
    ) -> Dict[str, Any]:
        new_seq = current_seq + 1
        status = "MATCH" if variance == 0 else "MISMATCH"
        update_data = self._build_sql_update_data(
            sql_qty=sql_qty,
            mongo_qty=mongo_qty,
            variance=variance,
            latency_ms=latency_ms,
            new_seq=new_seq,
            status=status,
        )
        update_result = await db.erp_items.update_one(
            {"_id": mongo_item["_id"], "stock_qty": mongo_qty},
            {"$set": update_data},
        )
        if update_result.modified_count == 0:
            conflict_outcome = await self._handle_update_conflict_or_loss(
                item_code=item_code,
                sql_qty=sql_qty,
                mongo_item=mongo_item,
                mongo_qty=mongo_qty,
            )
            conflict_outcome.update({"seq": new_seq})
            return conflict_outcome

        logger.info(
            f"GOVERNANCE_LOG: item={item_code} sql={sql_qty} mongo={mongo_qty} "
            f"var={variance} lat={latency_ms:.2f}ms seq={new_seq} stat={status}"
        )
        return {
            "error": None,
            "event_status": status,
            "seq": new_seq,
            "status": status,
            "verified_at": update_data["last_sql_verified_at"],
        }

    async def _verify_item_with_sql_qty(
        self, item_code: str, sql_qty: float, latency_ms: float
    ) -> Dict[str, Any]:
        error_info: Optional[Dict[str, Any]] = None
        event_status = "FAILED"
        mongo_qty: Optional[float] = None
        variance: Optional[float] = None
        seq: Optional[int] = None

        try:
            validation_error = self._validate_sql_qty_or_error(item_code, sql_qty)
            if validation_error:
                error_info = validation_error
                return validation_error

            (
                mongo_item,
                mongo_qty,
                variance,
                current_seq,
                preparation_error,
            ) = await self._prepare_verification_context(
                item_code=item_code,
                sql_qty=sql_qty,
                latency_ms=latency_ms,
            )
            if preparation_error:
                error_info = preparation_error
                return preparation_error

            assert mongo_item is not None
            assert mongo_qty is not None
            assert variance is not None
            assert current_seq is not None

            update_outcome = await self._apply_sql_verification_update(
                item_code=item_code,
                sql_qty=sql_qty,
                mongo_item=mongo_item,
                mongo_qty=mongo_qty,
                variance=variance,
                latency_ms=latency_ms,
                current_seq=current_seq,
            )
            seq = update_outcome.get("seq")
            event_status = update_outcome.get("event_status", event_status)
            if update_outcome.get("error"):
                error_info = update_outcome["error"]
                return update_outcome["error"]

            return self._build_verification_success_response(
                item_code=item_code,
                sql_qty=sql_qty,
                mongo_qty=mongo_qty,
                variance=variance,
                verified_at=update_outcome["verified_at"],
                seq=seq,
                latency_ms=latency_ms,
            )

        except SQLVerificationError as e:
            logger.error("Governance Error verifying %s: %s", item_code, e)
            error_info = self._error_response(
                error_code="ERP_INVALID_RESULT",
                item_code=item_code,
            )
            return error_info
        except Exception as e:
            logger.error("Governance Error verifying %s: %s", item_code, e)
            error_info = self._error_response(
                error_code="VERIFICATION_INTERNAL_ERROR",
                item_code=item_code,
            )
            return error_info
        finally:
            await self._record_governance_event(
                item_code=item_code,
                sql_qty=sql_qty,
                mongo_qty=mongo_qty,
                variance=variance,
                latency_ms=latency_ms,
                seq=seq,
                status=event_status,
                error_info=error_info,
            )

    async def verify_item_quantity(self, item_code: str) -> Dict[str, Any]:
        """
        GOVERNANCE MANDATE: Enforce authoritative stock truth from SQL Server.
        See backend/docs/SQL_VERIFICATION_GOVERNANCE.md for strict rules.

        Execution Contract:
        1. Read authoritative quantity from SQL Server (with latency measurement).
        2. Reject non-numeric, null, negative, or ambiguous results.
        3. Read Mongo instance.
        4. Compute variance.
        5. Atomic conditional write (optimistic locking).
        6. Handle conflicts (fork/log).
        7. Persist forensic fields.
        """
        import time

        start_time = time.perf_counter()
        latency_ms: Optional[float] = None

        try:
            # 1. Read Authoritative Quantity from SQL Server
            sql_qty = await self._get_sql_quantity(item_code)
            latency_ms = (time.perf_counter() - start_time) * 1000
        except Exception as e:
            latency_ms = (time.perf_counter() - start_time) * 1000
            error_code, log_prefix = self._verification_fail_fast_details(e)
            return await self._record_failed_verification(
                item_code=item_code,
                error_code=error_code,
                latency_ms=latency_ms,
                exc=e,
                log_prefix=log_prefix,
            )

        return await self._verify_item_with_sql_qty(item_code, sql_qty, latency_ms)

    async def _get_sql_quantity(self, item_code: str) -> float:
        """Get item quantity from SQL Server with strict extraction"""
        try:
            query = self.sql_connector._get_formatted_query("get_item_quantity")
            result = await self.sql_connector.execute_query(query, params=[item_code])

            if result is None or len(result) == 0:
                raise SQLNullResultError("SQL returned no rows for quantity lookup")
            if len(result) > 1:
                raise SQLAmbiguousResultError("SQL returned multiple rows for quantity lookup")

            qty = result[0].get("verified_qty")
            if qty is None:
                raise SQLInvalidNumericError("SQL result missing verified_qty")

            try:
                qty_value = float(qty)
            except (TypeError, ValueError):
                raise SQLInvalidNumericError("SQL quantity is not numeric") from None

            if not math.isfinite(qty_value):
                raise SQLInvalidNumericError("SQL quantity is not finite")

            return qty_value

        except SQLVerificationError:
            raise
        except Exception as e:
            logger.error("Error getting SQL quantity for %s: %s", item_code, e)
            raise

    @staticmethod
    def _batch_duration_ms(start: datetime) -> float:
        return (datetime.now(timezone.utc).replace(tzinfo=None) - start).total_seconds() * 1000

    async def _build_batch_failure_response(
        self,
        *,
        item_codes: list[str],
        error_code: str,
        start: datetime,
        latency_ms: Optional[float],
    ) -> Dict[str, Any]:
        errors = [
            self._error_response(
                error_code=error_code,
                item_code=code,
            )
            for code in item_codes
        ]
        template = errors[0] if errors else self._error_response(error_code=error_code, item_code="unknown")
        await asyncio.gather(
            *[
                self._record_governance_event(
                    item_code=err["item_code"],
                    sql_qty=None,
                    mongo_qty=None,
                    variance=None,
                    latency_ms=latency_ms,
                    seq=None,
                    status="FAILED",
                    error_info=err,
                )
                for err in errors
            ]
        )
        return {
            "success": False,
            "error_code": error_code,
            "message": template["message"],
            "status_code": template["status_code"],
            "verified_count": 0,
            "error_count": len(errors),
            "results": [],
            "errors": errors,
            "batch_duration_ms": self._batch_duration_ms(start),
        }

    def _batch_query_failure_code(self, exc: Exception) -> str:
        if isinstance(exc, DatabaseConnectionError):
            return "SQL_CONNECTION_ERROR"
        if isinstance(exc, ERPReadOnlyViolation):
            return "ERP_READ_ONLY_VIOLATION"
        if isinstance(exc, ERPQueryParameterError):
            return "ERP_QUERY_PARAMETER_ERROR"
        if isinstance(exc, DatabaseQueryError):
            return "ERP_QUERY_ERROR"
        return "SQL_BATCH_FAILURE"

    def _batch_result_error_code(
        self,
        quantities: Dict[str, Any],
        item_codes: list[str],
    ) -> str | None:
        if len(quantities) != len(item_codes):
            return "ERP_AMBIGUOUS_BATCH_RESULT"

        for code in item_codes:
            if code not in quantities:
                return "ERP_AMBIGUOUS_BATCH_RESULT"
            quantity = quantities[code]
            if isinstance(quantity, bool) or not isinstance(quantity, (int, float)):
                return "ERP_INVALID_BATCH_RESULT"
            if not math.isfinite(quantity):
                return "ERP_INVALID_BATCH_RESULT"

        return None

    async def _get_batch_quantities(
        self, item_codes: list[str]
    ) -> tuple[Optional[Dict[str, float]], Optional[str], Optional[float]]:
        batch_start = time.perf_counter()
        try:
            quantities = await asyncio.to_thread(self.sql_connector.get_item_quantities_only, item_codes)
            latency_ms = (time.perf_counter() - batch_start) * 1000
            return quantities, None, latency_ms
        except DatabaseConnectionError as exc:
            logger.error("Batch SQL connection failed: %s", exc)
            failure_code = self._batch_query_failure_code(exc)
        except ERPReadOnlyViolation as exc:
            logger.error("Batch ERP read-only violation: %s", exc)
            failure_code = self._batch_query_failure_code(exc)
        except ERPQueryParameterError as exc:
            logger.error("Batch ERP parameterization error: %s", exc)
            failure_code = self._batch_query_failure_code(exc)
        except DatabaseQueryError as exc:
            logger.error("Batch ERP query failed: %s", exc)
            failure_code = self._batch_query_failure_code(exc)
        except Exception as exc:
            logger.error("Batch verification failed: %s", exc)
            failure_code = self._batch_query_failure_code(exc)

        latency_ms = (time.perf_counter() - batch_start) * 1000
        return None, failure_code, latency_ms

    def _split_batch_verification_results(
        self, results: list[Any]
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        processed_results: list[dict[str, Any]] = []
        errors: list[dict[str, Any]] = []
        for result in results:
            if isinstance(result, Exception):
                errors.append(
                    self._error_response(
                        error_code="VERIFICATION_INTERNAL_ERROR",
                        item_code="unknown",
                    )
                )
                continue
            if isinstance(result, dict) and not result.get("success"):
                errors.append(result)
                continue
            if isinstance(result, dict):
                processed_results.append(result)
        return processed_results, errors

    async def batch_verify_items(self, item_codes: list[str]) -> Dict[str, Any]:
        """Verify multiple items in batch (Parallelized)."""
        start = datetime.now(timezone.utc).replace(tzinfo=None)

        if not item_codes:
            return {
                "success": True,
                "verified_count": 0,
                "error_count": 0,
                "results": [],
                "errors": [],
                "batch_duration_ms": self._batch_duration_ms(start),
            }

        quantities, batch_failure, batch_latency_ms = await self._get_batch_quantities(item_codes)
        if batch_failure:
            return await self._build_batch_failure_response(
                item_codes=item_codes,
                error_code=batch_failure,
                start=start,
                latency_ms=batch_latency_ms,
            )
        if quantities is None:
            return await self._build_batch_failure_response(
                item_codes=item_codes,
                error_code="SQL_BATCH_FAILURE",
                start=start,
                latency_ms=batch_latency_ms,
            )

        batch_result_error_code = self._batch_result_error_code(quantities, item_codes)
        if batch_result_error_code:
            return await self._build_batch_failure_response(
                item_codes=item_codes,
                error_code=batch_result_error_code,
                start=start,
                latency_ms=batch_latency_ms,
            )

        tasks = [
            self._verify_item_with_sql_qty(code, quantities[code], batch_latency_ms or 0.0)
            for code in item_codes
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        processed_results, errors = self._split_batch_verification_results(results)

        return {
            "success": len(errors) == 0,
            "verified_count": len(processed_results),
            "error_count": len(errors),
            "results": processed_results,
            "errors": errors,
            "batch_duration_ms": self._batch_duration_ms(start),
        }

    async def get_verification_status(self, item_code: str) -> Dict[str, Any]:
        """Get verification status for an item"""
        try:
            item = await db.erp_items.find_one(
                {"$or": [{"item_code": item_code}, {"barcode": item_code}]},
                {
                    "sql_verified_qty": 1,
                    "last_sql_verified_at": 1,
                    "variance": 1,
                    "mongo_cached_qty_previous": 1,
                    "sql_qty_mismatch_flag": 1,
                    "sql_verification_status": 1,
                    "stock_qty": 1,
                },
            )

            if not item:
                return self._error_response(
                    error_code="ITEM_NOT_FOUND",
                    item_code=item_code,
                    message="Item not found",
                )

            return {
                "success": True,
                "item_code": item_code,
                "sql_verified_qty": item.get("sql_verified_qty"),
                "last_sql_verified_at": item.get("last_sql_verified_at"),
                "variance": item.get("variance"),
                "mongo_cached_qty_previous": item.get("mongo_cached_qty_previous"),
                "sql_qty_mismatch_flag": item.get("sql_qty_mismatch_flag", False),
                "sql_verification_status": item.get("sql_verification_status"),
                "current_mongo_qty": item.get("stock_qty"),
            }

        except Exception as e:
            logger.error("Error getting verification status for %s: %s", item_code, e)
            return self._error_response(
                error_code="VERIFICATION_INTERNAL_ERROR",
                item_code=item_code,
                message="Failed to get verification status.",
            )

    async def check_sql_status(self) -> Dict[str, Any]:
        """Check SQL Server connection status"""
        try:
            # Try a simple query to check connection
            test_query = "SELECT 1 as test"
            await self.sql_connector.execute_query(test_query)

            return {
                "success": True,
                "status": "connected",
                "message": "SQL Server is connected and responding",
                "timestamp": datetime.now(timezone.utc).replace(tzinfo=None),
            }

        except Exception:
            return {
                "success": False,
                "status": "disconnected",
                "message": "SQL Server connection failed",
                "error_code": "SQL_CONNECTION_ERROR",
                "timestamp": datetime.now(timezone.utc).replace(tzinfo=None),
            }


# Singleton instance
sql_verification_service = SQLVerificationService()
