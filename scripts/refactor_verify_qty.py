import re

FILE_PATH = r"d:\n.STK\backend\services\sql_verification_service.py"

with open(FILE_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

new_code = """
    async def _handle_sql_verification_error(
        self,
        exc: Exception,
        item_code: str,
        latency_ms: float,
    ) -> Dict[str, Any]:
        from backend.sql_server_connector import (
            DatabaseConnectionError,
            DatabaseQueryError,
            ERPQueryParameterError,
            ERPReadOnlyViolation,
        )
        
        error_info = None
        
        if isinstance(exc, DatabaseConnectionError):
            logger.error(f"FAIL-FAST: SQL connection failed for {item_code}: {exc}")
            error_info = self._error_response(
                error_code="SQL_CONNECTION_ERROR",
                message="ERP system is temporarily unavailable. Please try again later.",
                status_code=503,
                item_code=item_code,
                box_status="SQL_FAILURE",
            )
        elif isinstance(exc, ERPReadOnlyViolation):
            logger.error(f"FAIL-FAST: ERP read-only violation for {item_code}: {exc}")
            error_info = self._error_response(
                error_code="ERP_READ_ONLY_VIOLATION",
                message="Write operation blocked on ERP.",
                status_code=400,
                item_code=item_code,
            )
        elif isinstance(exc, ERPQueryParameterError):
            logger.error(f"FAIL-FAST: ERP parameterization error for {item_code}: {exc}")
            error_info = self._error_response(
                error_code="ERP_QUERY_PARAMETER_ERROR",
                message="ERP query blocked due to unsafe parameters.",
                status_code=400,
                item_code=item_code,
            )
        elif isinstance(exc, SQLNullResultError):
            logger.error(f"ERP null result for {item_code}: {exc}")
            error_info = self._error_response(
                error_code="ERP_NULL_RESULT",
                message="ERP returned no quantity for this item.",
                status_code=500,
                item_code=item_code,
            )
        elif isinstance(exc, SQLAmbiguousResultError):
            logger.error(f"ERP ambiguous result for {item_code}: {exc}")
            error_info = self._error_response(
                error_code="ERP_AMBIGUOUS_RESULT",
                message="ERP returned ambiguous quantity for this item.",
                status_code=500,
                item_code=item_code,
            )
        elif isinstance(exc, SQLInvalidNumericError):
            logger.error(f"ERP invalid numeric result for {item_code}: {exc}")
            error_info = self._error_response(
                error_code="ERP_INVALID_RESULT",
                message="ERP returned invalid quantity for this item.",
                status_code=500,
                item_code=item_code,
            )
        elif isinstance(exc, DatabaseQueryError):
            logger.error(f"ERP query failed for {item_code}: {exc}")
            error_info = self._error_response(
                error_code="ERP_QUERY_ERROR",
                message="ERP query failed. Please try again later.",
                status_code=500,
                item_code=item_code,
            )
        else:
            logger.error(f"Governance Error verifying {item_code}: {str(exc)}")
            error_text = str(exc).lower()
            if any(term in error_text for term in ["connection", "sql server", "timeout", "reconnect"]):
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

    async def verify_item_quantity(self, item_code: str) -> Dict[str, Any]:
        \"\"\"
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
        \"\"\"
        import time

        start_time = time.perf_counter()
        latency_ms: Optional[float] = None

        try:
            # 1. Read Authoritative Quantity from SQL Server
            sql_qty = await self._get_sql_quantity(item_code)
            latency_ms = (time.perf_counter() - start_time) * 1000
        except Exception as e:
            latency_ms = (time.perf_counter() - start_time) * 1000
            return await self._handle_sql_verification_error(e, item_code, latency_ms)

        return await self._verify_item_with_sql_qty(item_code, sql_qty, latency_ms)"""

# we match `    async def verify_item_quantity(self, item_code: str) -> Dict[str, Any]:`
# up to `        return await self._verify_item_with_sql_qty(item_code, sql_qty, latency_ms)\n`

pattern = r'(    async def verify_item_quantity\(self, item_code: str\) -> Dict\[str, Any\]:\n.*?return await self\._verify_item_with_sql_qty\(item_code, sql_qty, latency_ms\)\n)'

match = re.search(pattern, content, flags=re.DOTALL)
if match:
    old_code = match.group(1)
    new_content = content.replace(old_code, new_code[1:]) # remove leading newline
    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Successfully refactored verify_item_quantity")
else:
    print("Could not find verify_item_quantity function")
