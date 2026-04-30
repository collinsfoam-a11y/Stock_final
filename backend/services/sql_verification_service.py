"""
SQL Verification Service - Verifies item quantities from SQL Server
Implements business logic requirement: Item selection triggers SQL qty read + Mongo writeback
"""

import asyncio
import logging
import math
import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from backend.sql_server_connector import SQLServerConnector
from backend.core.database import db
from backend.services.governance_guard import write_authority

logger = logging.getLogger(__name__)


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
        message: str,
        status_code: int,
        item_code: str,
        context: Optional[dict[str, Any]] = None,
        box_status: Optional[str] = None,
        status: Optional[str] = None,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "success": False,
            "error_code": error_code,
            "message": message,
            "status_code": status_code,
            "item_code": item_code,
            "error": message,
        }
        if context:
            payload["context"] = context
        if box_status:
            payload["box_status"] = box_status
        if status:
            payload["status"] = status
        return payload

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
            logger.error(f"Governance event insert failed for {item_code}: {str(e)}")

    def _validate_sql_qty_or_error(
        self, item_code: str, sql_qty: float
    ) -> Optional[Dict[str, Any]]:
        if isinstance(sql_qty, bool) or not isinstance(sql_qty, (int, float)):
            raise SQLInvalidNumericError("Non-numeric SQL result")
        if not math.isfinite(sql_qty):
            raise SQLInvalidNumericError("Non-finite SQL result")
        if sql_qty >= 0:
            return None

        logger.error(f"CRITICAL: Negative SQL quantity rejected: {sql_qty} for {item_code}")
        return self._error_response(
            error_code="SQL_NEGATIVE_QTY",
            message="Governance rejection: negative SQL quantity",
            status_code=422,
            item_code=item_code,
        )

    def _warn_high_latency_if_needed(
        self, item_code: str, latency_ms: float, max_latency_ms: float
    ) -> None:
        if latency_ms <= max_latency_ms:
            return
        logger.warning(f"PERFORMANCE: SQL Latency High ({latency_ms:.2f}ms) for {item_code}")

    async def _load_mongo_item_snapshot(self, item_code: str) -> Optional[dict[str, Any]]:
        mongo_item = await db.erp_items.find_one(
            {"$or": [{"item_code": item_code}, {"barcode": item_code}]}
        )
        if mongo_item:
            return mongo_item
        logger.warning(f"Item {item_code} not found in Mongo Ledger")
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
                    message="Governance rejection: non-numeric Mongo quantity",
                    status_code=422,
                    item_code=item_code,
                )

        if isinstance(normalized_qty, bool) or not isinstance(normalized_qty, (int, float)):
            logger.error(
                f"CRITICAL: Non-numeric Mongo quantity rejected: {normalized_qty} for {item_code}"
            )
            return None, self._error_response(
                error_code="MONGO_NON_NUMERIC_QTY",
                message="Governance rejection: non-numeric Mongo quantity",
                status_code=422,
                item_code=item_code,
            )

        if not math.isfinite(normalized_qty):
            logger.error(
                f"CRITICAL: Non-finite Mongo quantity rejected: {normalized_qty} for {item_code}"
            )
            return None, self._error_response(
                error_code="MONGO_NON_FINITE_QTY",
                message="Governance rejection: non-finite Mongo quantity",
                status_code=422,
                item_code=item_code,
            )

        return float(normalized_qty), None

    def _variance_threshold_error(
        self, *, item_code: str, variance: float, max_variance: float, strict_mode: bool
    ) -> Optional[Dict[str, Any]]:
        if abs(variance) <= max_variance:
            return None

        logger.warning(f"VARIANCE: Large variance detected ({variance}) for {item_code}")
        if not strict_mode:
            return None

        return self._error_response(
            error_code="SQL_VARIANCE_THRESHOLD",
            message="Variance exceeds governance threshold",
            status_code=422,
            item_code=item_code,
            status="ERROR",
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
                    message="State conflict: data changed during verification",
                    status_code=409,
                    item_code=item_code,
                    status="conflict",
                ),
                "event_status": "CONFLICT",
            }

        logger.warning(f"No document updated (Item deleted?): {item_code}")
        return {
            "error": self._error_response(
                error_code="ITEM_LOST",
                message="Item lost during update",
                status_code=404,
                item_code=item_code,
            ),
            "event_status": "FAILED",
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
        with write_authority("SQLVerificationService"):
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
        from backend.config_governance import (
            SQL_VERIFY_STRICT,
            SQL_MAX_VARIANCE,
            SQL_MAX_LATENCY_MS,
        )

        error_info: Optional[Dict[str, Any]] = None
        event_status = "FAILED"
        mongo_qty: Optional[float] = None
        variance: Optional[float] = None
        seq: Optional[int] = None
        result: Dict[str, Any]

        try:
            validation_error = self._validate_sql_qty_or_error(item_code, sql_qty)
            if validation_error:
                error_info = validation_error
                return validation_error

            self._warn_high_latency_if_needed(item_code, latency_ms, SQL_MAX_LATENCY_MS)
            mongo_item = await self._load_mongo_item_snapshot(item_code)
            if not mongo_item:
                error_info = self._error_response(
                    error_code="ITEM_NOT_FOUND",
                    message="Item not found in MongoDB",
                    status_code=404,
                    item_code=item_code,
                )
                return error_info

            mongo_qty, mongo_qty_error = self._normalize_mongo_qty_or_error(
                item_code, mongo_item.get("stock_qty", 0)
            )
            if mongo_qty_error:
                error_info = mongo_qty_error
                return mongo_qty_error

            current_seq = int(mongo_item.get("sql_verification_seq", 0) or 0)
            variance = sql_qty - mongo_qty
            threshold_error = self._variance_threshold_error(
                item_code=item_code,
                variance=variance,
                max_variance=SQL_MAX_VARIANCE,
                strict_mode=SQL_VERIFY_STRICT,
            )
            if threshold_error:
                error_info = threshold_error
                return threshold_error

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

            result = {
                "success": True,
                "item_code": item_code,
                "sql_qty": sql_qty,
                "mongo_qty": mongo_qty,
                "variance": variance,
                "verified_at": update_outcome["verified_at"],
                "mismatch": variance != 0,
                "seq": seq,
                "latency_ms": latency_ms,
            }
            return result

        except SQLVerificationError as e:
            logger.error(f"Governance Error verifying {item_code}: {str(e)}")
            error_info = self._error_response(
                error_code="ERP_INVALID_RESULT",
                message="ERP returned invalid quantity",
                status_code=500,
                item_code=item_code,
            )
            return error_info
        except Exception as e:
            logger.error(f"Governance Error verifying {item_code}: {str(e)}")
            error_info = self._error_response(
                error_code="VERIFICATION_INTERNAL_ERROR",
                message="Verification failed due to an internal error",
                status_code=500,
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

        from backend.sql_server_connector import (
            DatabaseConnectionError,
            DatabaseQueryError,
            ERPQueryParameterError,
            ERPReadOnlyViolation,
        )

        try:
            # 1. Read Authoritative Quantity from SQL Server
            sql_qty = await self._get_sql_quantity(item_code)
            latency_ms = (time.perf_counter() - start_time) * 1000
        except DatabaseConnectionError as e:
            latency_ms = (time.perf_counter() - start_time) * 1000
            logger.error(f"FAIL-FAST: SQL connection failed for {item_code}: {e}")
            error_info = self._error_response(
                error_code="SQL_CONNECTION_ERROR",
                message="ERP system is temporarily unavailable. Please try again later.",
                status_code=503,
                item_code=item_code,
                box_status="SQL_FAILURE",
            )
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
        except ERPReadOnlyViolation as e:
            latency_ms = (time.perf_counter() - start_time) * 1000
            logger.error(f"FAIL-FAST: ERP read-only violation for {item_code}: {e}")
            error_info = self._error_response(
                error_code="ERP_READ_ONLY_VIOLATION",
                message="Write operation blocked on ERP.",
                status_code=400,
                item_code=item_code,
            )
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
        except ERPQueryParameterError as e:
            latency_ms = (time.perf_counter() - start_time) * 1000
            logger.error(f"FAIL-FAST: ERP parameterization error for {item_code}: {e}")
            error_info = self._error_response(
                error_code="ERP_QUERY_PARAMETER_ERROR",
                message="ERP query blocked due to unsafe parameters.",
                status_code=400,
                item_code=item_code,
            )
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
        except SQLNullResultError as e:
            latency_ms = (time.perf_counter() - start_time) * 1000
            logger.error(f"ERP null result for {item_code}: {e}")
            error_info = self._error_response(
                error_code="ERP_NULL_RESULT",
                message="ERP returned no quantity for this item.",
                status_code=500,
                item_code=item_code,
            )
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
        except SQLAmbiguousResultError as e:
            latency_ms = (time.perf_counter() - start_time) * 1000
            logger.error(f"ERP ambiguous result for {item_code}: {e}")
            error_info = self._error_response(
                error_code="ERP_AMBIGUOUS_RESULT",
                message="ERP returned ambiguous quantity for this item.",
                status_code=500,
                item_code=item_code,
            )
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
        except SQLInvalidNumericError as e:
            latency_ms = (time.perf_counter() - start_time) * 1000
            logger.error(f"ERP invalid numeric result for {item_code}: {e}")
            error_info = self._error_response(
                error_code="ERP_INVALID_RESULT",
                message="ERP returned invalid quantity for this item.",
                status_code=500,
                item_code=item_code,
            )
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
        except DatabaseQueryError as e:
            latency_ms = (time.perf_counter() - start_time) * 1000
            logger.error(f"ERP query failed for {item_code}: {e}")
            error_info = self._error_response(
                error_code="ERP_QUERY_ERROR",
                message="ERP query failed. Please try again later.",
                status_code=500,
                item_code=item_code,
            )
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
        except Exception as e:
            latency_ms = (time.perf_counter() - start_time) * 1000
            logger.error(f"Governance Error verifying {item_code}: {str(e)}")
            error_text = str(e).lower()
            if any(
                term in error_text for term in ["connection", "sql server", "timeout", "reconnect"]
            ):
                error_info = self._error_response(
                    error_code="SQL_CONNECTION_ERROR",
                    message="ERP system is temporarily unavailable. Please try again later.",
                    status_code=503,
                    item_code=item_code,
                    box_status="SQL_FAILURE",
                )
            else:
                error_info = self._error_response(
                    error_code="VERIFICATION_INTERNAL_ERROR",
                    message="Verification failed due to an internal error.",
                    status_code=500,
                    item_code=item_code,
                )
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
            logger.error(f"Error getting SQL quantity for {item_code}: {str(e)}")
            raise

    @staticmethod
    def _batch_duration_ms(start: datetime) -> float:
        return (datetime.now(timezone.utc).replace(tzinfo=None) - start).total_seconds() * 1000

    async def _build_batch_failure_response(
        self,
        *,
        item_codes: list[str],
        error_code: str,
        message: str,
        status_code: int,
        start: datetime,
        latency_ms: Optional[float],
        box_status: Optional[str] = None,
    ) -> Dict[str, Any]:
        errors = [
            self._error_response(
                error_code=error_code,
                message=message,
                status_code=status_code,
                item_code=code,
                box_status=box_status,
            )
            for code in item_codes
        ]
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
            "message": message,
            "status_code": status_code,
            "verified_count": 0,
            "error_count": len(errors),
            "results": [],
            "errors": errors,
            "batch_duration_ms": self._batch_duration_ms(start),
        }

    async def _get_batch_quantities(
        self, item_codes: list[str]
    ) -> tuple[Optional[Dict[str, float]], Optional[dict[str, Any]], Optional[float]]:
        from backend.sql_server_connector import (
            DatabaseConnectionError,
            DatabaseQueryError,
            ERPQueryParameterError,
            ERPReadOnlyViolation,
        )

        batch_start = time.perf_counter()
        try:
            quantities = await asyncio.to_thread(
                self.sql_connector.get_item_quantities_only, item_codes
            )
            latency_ms = (time.perf_counter() - batch_start) * 1000
            return quantities, None, latency_ms
        except DatabaseConnectionError as exc:
            logger.error(f"Batch SQL connection failed: {exc}")
            failure = {
                "error_code": "SQL_CONNECTION_ERROR",
                "message": "ERP system is temporarily unavailable. Please try again later.",
                "status_code": 503,
                "box_status": "SQL_FAILURE",
            }
        except ERPReadOnlyViolation as exc:
            logger.error(f"Batch ERP read-only violation: {exc}")
            failure = {
                "error_code": "ERP_READ_ONLY_VIOLATION",
                "message": "Write operation blocked on ERP.",
                "status_code": 400,
                "box_status": None,
            }
        except ERPQueryParameterError as exc:
            logger.error(f"Batch ERP parameterization error: {exc}")
            failure = {
                "error_code": "ERP_QUERY_PARAMETER_ERROR",
                "message": "ERP query blocked due to unsafe parameters.",
                "status_code": 400,
                "box_status": None,
            }
        except DatabaseQueryError as exc:
            logger.error(f"Batch ERP query failed: {exc}")
            failure = {
                "error_code": "ERP_QUERY_ERROR",
                "message": "ERP batch query failed. Please try again later.",
                "status_code": 500,
                "box_status": None,
            }
        except Exception as exc:
            logger.error(f"Batch verification failed: {exc}")
            failure = {
                "error_code": "SQL_BATCH_FAILURE",
                "message": "Batch verification failed due to an internal error.",
                "status_code": 500,
                "box_status": None,
            }

        latency_ms = (time.perf_counter() - batch_start) * 1000
        return None, failure, latency_ms

    @staticmethod
    def _is_incomplete_batch_result(quantities: Dict[str, float], item_codes: list[str]) -> bool:
        if len(quantities) != len(item_codes):
            return True
        return any(quantities.get(code) is None for code in item_codes)

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
                        message="Verification failed due to an internal error.",
                        status_code=500,
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
                error_code=batch_failure["error_code"],
                message=batch_failure["message"],
                status_code=batch_failure["status_code"],
                box_status=batch_failure["box_status"],
                start=start,
                latency_ms=batch_latency_ms,
            )
        if quantities is None:
            return await self._build_batch_failure_response(
                item_codes=item_codes,
                error_code="SQL_BATCH_FAILURE",
                message="Batch verification failed due to an internal error.",
                status_code=500,
                start=start,
                latency_ms=batch_latency_ms,
            )

        if self._is_incomplete_batch_result(quantities, item_codes):
            return await self._build_batch_failure_response(
                item_codes=item_codes,
                error_code="ERP_AMBIGUOUS_BATCH_RESULT",
                message="ERP batch returned incomplete results.",
                status_code=500,
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
                    message="Item not found",
                    status_code=404,
                    item_code=item_code,
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
            logger.error(f"Error getting verification status for {item_code}: {str(e)}")
            return self._error_response(
                error_code="VERIFICATION_INTERNAL_ERROR",
                message="Failed to get verification status.",
                status_code=500,
                item_code=item_code,
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
