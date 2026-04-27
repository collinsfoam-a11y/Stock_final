from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import inspect
from typing import Any, Optional

from fastapi import HTTPException

from backend.services.snapshot_service import SnapshotService
from backend.services.variance_service import VarianceService


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _normalize_reason(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        if value in (None, ""):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _resolve_unit_price(item: dict[str, Any]) -> float:
    for field_name in ("last_cost", "sale_price", "sales_price", "mrp"):
        value = _as_float(item.get(field_name), default=0.0)
        if value != 0.0 or item.get(field_name) not in (None, ""):
            return value
    return 0.0


@dataclass(frozen=True)
class CountLineGovernanceDecision:
    approval_status: str
    approved_at: Optional[datetime]
    approved_by: Optional[str]
    requires_supervisor_approval: bool
    status: str
    variance: float
    variance_data: dict[str, Any]
    violated_thresholds: list[dict[str, Any]]


class CountLineWriteService:
    """Authoritative write-side governance for count-line mutations."""

    def __init__(
        self,
        db: Any,
        *,
        snapshot_service: Optional[SnapshotService] = None,
        variance_service: Optional[VarianceService] = None,
    ) -> None:
        self.db = db
        self.snapshot_service = snapshot_service or SnapshotService(db)
        self.variance_service = variance_service or VarianceService(db)

    async def _resolve_awaitable(self, value: Any) -> Any:
        resolved = value
        for _ in range(10):
            if not inspect.isawaitable(resolved):
                break
            resolved = await resolved
        return resolved

    async def process_write(
        self,
        payload: dict[str, Any],
        context: Optional[dict[str, Any]] = None,
    ) -> Any:
        """
        Single persistence boundary for count-line mutations.

        Contract:
            process_write(payload, context) -> result

        payload:
            {
                "operation": "insert_one|update_one|update_many|delete_one|delete_many",
                "filter": {...},          # for update/delete
                "update": {...},          # for update
                "document": {...},        # for insert
                "upsert": bool,           # optional update_one flag
            }

        context (optional):
            {
                "session": {...},                 # optional preloaded session document
                "session_id": "sess-123",         # optional session identifier
                "session_ids": ["..."],           # optional multiple session ids
                "candidate_lines": [ {...} ],     # optional preloaded matched count lines
                "enforce_snapshot": True,         # default True
                "allow_missing_session": False,   # default False
                "enforce_variance": False,        # compatibility hint; quantity writes govern anyway
                "set_status_from_governance": True,
                "variance_reason": "...",
                "correction_reason": {...} | "...",
                "location": "FLOOR-A",
                "erp_item": {...},
                "username": "user-id",
                "require_correction_reason_for_variance": False,
            }
        """
        if not isinstance(payload, dict):
            raise ValueError("payload must be a dictionary")

        operation = str(payload.get("operation") or "").strip().lower()
        if operation not in {
            "insert_one",
            "update_one",
            "update_many",
            "delete_one",
            "delete_many",
        }:
            raise ValueError(f"Unsupported count-line write operation: {operation}")

        ctx = context or {}
        await self._assert_snapshot_integrity_for_write(payload, ctx)
        self._apply_state_transition_for_write(payload, ctx)

        if self._should_apply_governance(payload, ctx):
            await self._enforce_variance_for_write(payload, ctx)

        collection = self.db.count_lines
        if operation == "insert_one":
            document = payload.get("document")
            if not isinstance(document, dict):
                raise ValueError("insert_one payload requires a 'document' dictionary")
            insert_result = collection.insert_one(document)
            return await self._resolve_awaitable(insert_result)

        if operation == "update_one":
            filter_query = payload.get("filter")
            update_doc = payload.get("update")
            if not isinstance(filter_query, dict) or not isinstance(update_doc, dict):
                raise ValueError("update_one payload requires 'filter' and 'update' dictionaries")
            upsert = bool(payload.get("upsert", False))
            prefer_keyword = bool(ctx.get("keyword_update", False))
            if prefer_keyword:
                try:
                    update_result = collection.update_one(
                        filter_query,
                        update=update_doc,
                        upsert=upsert,
                    )
                except TypeError:
                    if upsert:
                        update_result = collection.update_one(filter_query, update_doc, upsert)
                    else:
                        update_result = collection.update_one(filter_query, update_doc)
            else:
                try:
                    update_result = collection.update_one(filter_query, update_doc, upsert=upsert)
                except TypeError:
                    try:
                        update_result = collection.update_one(filter_query, update_doc)
                    except TypeError:
                        update_result = collection.update_one(
                            filter_query,
                            update=update_doc,
                            upsert=upsert,
                        )
            return await self._resolve_awaitable(update_result)

        if operation == "update_many":
            filter_query = payload.get("filter")
            update_doc = payload.get("update")
            if not isinstance(filter_query, dict) or not isinstance(update_doc, dict):
                raise ValueError("update_many payload requires 'filter' and 'update' dictionaries")
            prefer_keyword = bool(ctx.get("keyword_update", False))
            if prefer_keyword:
                try:
                    update_result = collection.update_many(filter_query, update=update_doc)
                except TypeError:
                    update_result = collection.update_many(filter_query, update_doc)
            else:
                try:
                    update_result = collection.update_many(filter_query, update_doc)
                except TypeError:
                    update_result = collection.update_many(filter_query, update=update_doc)
            return await self._resolve_awaitable(update_result)

        if operation == "delete_one":
            filter_query = payload.get("filter")
            if not isinstance(filter_query, dict):
                raise ValueError("delete_one payload requires a 'filter' dictionary")
            delete_result = collection.delete_one(filter_query)
            return await self._resolve_awaitable(delete_result)

        filter_query = payload.get("filter")
        if not isinstance(filter_query, dict):
            raise ValueError("delete_many payload requires a 'filter' dictionary")
        delete_result = collection.delete_many(filter_query)
        return await self._resolve_awaitable(delete_result)

    def _apply_state_transition_for_write(
        self,
        payload: dict[str, Any],
        context: dict[str, Any],
    ) -> None:
        transition = str(context.get("transition") or "").strip().lower()
        if not transition:
            return

        operation = str(payload.get("operation") or "").strip().lower()
        if operation not in {"update_one", "update_many"}:
            raise ValueError(f"State transition '{transition}' requires update_one or update_many")

        update_doc = payload.setdefault("update", {})
        if not isinstance(update_doc, dict):
            raise ValueError("State transition writes require an update document")

        set_doc = update_doc.setdefault("$set", {})
        if not isinstance(set_doc, dict):
            raise ValueError("State transition writes require a '$set' dictionary")

        actor = str(
            context.get("username")
            or context.get("user_id")
            or context.get("actor")
            or "system"
        ).strip() or "system"
        occurred_at = context.get("transitioned_at")
        if not isinstance(occurred_at, datetime):
            occurred_at = _utc_now()

        if transition == "verify":
            set_doc["verified"] = True
            set_doc["verified_by"] = actor
            set_doc["verified_at"] = occurred_at
            return

        if transition == "unverify":
            set_doc["verified"] = False
            set_doc["verified_by"] = None
            set_doc["verified_at"] = None
            return

        if transition == "approve":
            set_doc["status"] = "approved"
            set_doc["approval_status"] = "APPROVED"
            set_doc["approved_by"] = actor
            set_doc["approved_at"] = occurred_at
            set_doc["approval_note"] = _normalize_reason(context.get("approval_note"))
            set_doc["rejected_by"] = None
            set_doc["rejected_at"] = None
            set_doc["rejection_reason"] = None
            set_doc["assigned_to"] = None
            set_doc["recount_requested_at"] = None
            set_doc["recount_requested_by"] = None
            if bool(context.get("mark_verified_on_approval", False)):
                set_doc["verified"] = True
                set_doc["verified_by"] = actor
                set_doc["verified_at"] = occurred_at
            return

        if transition == "reject":
            set_doc["status"] = "rejected"
            set_doc["approval_status"] = "REJECTED"
            set_doc["approved_by"] = None
            set_doc["approved_at"] = None
            set_doc["approval_note"] = None
            set_doc["verified"] = False
            set_doc["verified_by"] = None
            set_doc["verified_at"] = None
            set_doc["rejected_by"] = actor
            set_doc["rejected_at"] = occurred_at
            set_doc["rejection_reason"] = _normalize_reason(
                context.get("rejection_reason")
                or context.get("approval_note")
                or context.get("transition_note")
            )
            if bool(context.get("mark_recount_requested", True)):
                set_doc["recount_requested_at"] = occurred_at
                set_doc["recount_requested_by"] = actor
                set_doc["assigned_to"] = _normalize_reason(context.get("assigned_to"))
            else:
                set_doc["recount_requested_at"] = None
                set_doc["recount_requested_by"] = None
                set_doc["assigned_to"] = None
            return

        raise ValueError(f"Unsupported count-line state transition: {transition}")

    def _should_apply_governance(
        self,
        payload: dict[str, Any],
        context: dict[str, Any],
    ) -> bool:
        if bool(context.get("skip_governance", False)):
            return False

        operation = str(payload.get("operation") or "").strip().lower()
        if operation == "insert_one":
            document = payload.get("document")
            return isinstance(document, dict) and "counted_qty" in document

        if operation == "update_one":
            update_doc = payload.get("update")
            if not isinstance(update_doc, dict):
                return False
            set_doc = update_doc.get("$set")
            return isinstance(set_doc, dict) and "counted_qty" in set_doc

        return bool(context.get("enforce_variance"))

    async def assert_session_integrity(
        self, *, session: Optional[dict[str, Any]] = None, session_id: Optional[str] = None
    ) -> Optional[dict[str, Any]]:
        if not hasattr(self.snapshot_service, "assert_session_snapshot_integrity"):
            return None
        try:
            result = self.snapshot_service.assert_session_snapshot_integrity(
                session, session_id=session_id
            )
            return await self._resolve_awaitable(result)
        except Exception as exc:
            if exc.__class__.__name__ != "SnapshotIntegrityError":
                raise
            raise HTTPException(
                status_code=409,
                detail="Snapshot integrity violated for this session",
            ) from exc

    async def resolve_baseline(
        self,
        *,
        session_id: str,
        item_code: str,
        username: str,
        erp_item: Optional[dict[str, Any]] = None,
    ) -> tuple[float, str]:
        session_snapshot = await self._resolve_awaitable(
            self.db.session_snapshots.find_one({"session_id": session_id})
        )
        if isinstance(session_snapshot, dict):
            snapshot_hash = str(session_snapshot.get("snapshot_hash") or "").strip()
            for item in session_snapshot.get("items") or []:
                if str(item.get("item_code") or "").strip() != item_code:
                    continue
                return _as_float(item.get("stock_qty")), snapshot_hash or "SESSION_SNAPSHOT"

        snapshot = None
        if hasattr(self.snapshot_service, "get_or_create_snapshot"):
            try:
                snapshot_result = self.snapshot_service.get_or_create_snapshot(
                    session_id, item_code, username
                )
                snapshot = await self._resolve_awaitable(snapshot_result)
            except Exception:
                snapshot = None
        if isinstance(snapshot, dict):
            return float(snapshot.get("erp_qty") or 0.0), str(snapshot.get("baseline_hash") or "")

        baseline_qty = float((erp_item or {}).get("stock_qty") or 0.0)
        return baseline_qty, "UNHASHED_FALLBACK"

    async def evaluate_policy(
        self,
        *,
        item_code: str,
        counted_qty: float,
        expected_qty: float,
        item: dict[str, Any],
        location: Optional[str] = None,
        variance_reason: Optional[str] = None,
        correction_reason: Optional[Any] = None,
        require_correction_reason_for_variance: bool = False,
    ) -> CountLineGovernanceDecision:
        variance = float(counted_qty) - float(expected_qty)
        reason_present = bool(_normalize_reason(variance_reason)) or bool(correction_reason)
        if require_correction_reason_for_variance and abs(variance) > 0 and not reason_present:
            raise HTTPException(
                status_code=400,
                detail="Correction reason is mandatory when variance exists",
            )

        variance_data = await self.variance_service.calculate_variance(
            item_code=item_code,
            counted_qty=float(counted_qty),
            expected_qty=float(expected_qty),
            unit_price=_resolve_unit_price(item),
            valuation_basis="last_cost",
        )
        requires_approval, violated_thresholds = await self.variance_service.check_thresholds(
            variance_data,
            item_category=item.get("category"),
            location=location,
        )

        if any(threshold.get("require_reason") for threshold in violated_thresholds) and not reason_present:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Variance reason is required for this count",
                    "violated_thresholds": violated_thresholds,
                    "variance_data": variance_data,
                },
            )

        approved_at = None if requires_approval else _utc_now()
        approved_by = None if requires_approval else "system"
        return CountLineGovernanceDecision(
            approval_status="NEEDS_REVIEW" if requires_approval else "APPROVED",
            approved_at=approved_at,
            approved_by=approved_by,
            requires_supervisor_approval=requires_approval,
            status="pending" if requires_approval else "approved",
            variance=variance,
            variance_data=variance_data,
            violated_thresholds=violated_thresholds,
        )

    async def evaluate_new_count_line(
        self,
        *,
        session: dict[str, Any],
        item_code: str,
        counted_qty: float,
        erp_item: dict[str, Any],
        expected_qty: float,
        variance_reason: Optional[str] = None,
        correction_reason: Optional[Any] = None,
        location: Optional[str] = None,
    ) -> CountLineGovernanceDecision:
        await self.assert_session_integrity(session=session)
        return await self.evaluate_policy(
            item_code=item_code,
            counted_qty=counted_qty,
            expected_qty=expected_qty,
            item=erp_item,
            location=location,
            variance_reason=variance_reason,
            correction_reason=correction_reason,
            require_correction_reason_for_variance=True,
        )

    async def evaluate_existing_count_line(
        self,
        *,
        session: dict[str, Any],
        count_line: dict[str, Any],
        counted_qty: float,
        erp_item: dict[str, Any],
        variance_reason: Optional[str] = None,
        correction_reason: Optional[Any] = None,
        location: Optional[str] = None,
        require_correction_reason_for_variance: bool = False,
    ) -> CountLineGovernanceDecision:
        await self.assert_session_integrity(session=session)
        expected_qty = float(count_line.get("erp_qty") or 0.0)
        return await self.evaluate_policy(
            item_code=str(count_line.get("item_code") or ""),
            counted_qty=counted_qty,
            expected_qty=expected_qty,
            item=erp_item,
            location=location,
            variance_reason=variance_reason,
            correction_reason=correction_reason,
            require_correction_reason_for_variance=require_correction_reason_for_variance,
        )

    async def _assert_snapshot_integrity_for_write(
        self,
        payload: dict[str, Any],
        context: dict[str, Any],
    ) -> None:
        if context.get("enforce_snapshot", True) is False:
            return

        explicit_session = context.get("session")
        if isinstance(explicit_session, dict):
            await self.assert_session_integrity(session=explicit_session)
            return

        session_ids = await self._collect_session_ids_for_write(payload, context)
        if not session_ids and not context.get("allow_missing_session", False):
            raise HTTPException(
                status_code=409,
                detail="Count line mutation requires session context",
            )

        checked = context.setdefault("_checked_session_ids", set())
        for session_id in session_ids:
            if session_id in checked:
                continue
            await self.assert_session_integrity(session_id=session_id)
            checked.add(session_id)

    async def _collect_session_ids_for_write(
        self,
        payload: dict[str, Any],
        context: dict[str, Any],
    ) -> list[str]:
        session_ids: set[str] = set()

        context_session_id = context.get("session_id")
        if context_session_id:
            session_ids.add(str(context_session_id))

        for session_id in context.get("session_ids") or []:
            if session_id:
                session_ids.add(str(session_id))

        for candidate in context.get("candidate_lines") or []:
            if isinstance(candidate, dict) and candidate.get("session_id"):
                session_ids.add(str(candidate["session_id"]))

        document = payload.get("document")
        if isinstance(document, dict) and document.get("session_id"):
            session_ids.add(str(document["session_id"]))

        filter_query = payload.get("filter")
        if isinstance(filter_query, dict):
            if filter_query.get("session_id"):
                session_ids.add(str(filter_query["session_id"]))
            if isinstance(filter_query.get("$or"), list):
                for branch in filter_query["$or"]:
                    if isinstance(branch, dict) and branch.get("session_id"):
                        session_ids.add(str(branch["session_id"]))

        if session_ids:
            return sorted(session_ids)

        operation = str(payload.get("operation") or "").strip().lower()
        if operation not in {"update_one", "update_many", "delete_one", "delete_many"}:
            return []

        if not isinstance(filter_query, dict):
            return []

        projection = {"_id": 0, "session_id": 1}
        if operation in {"update_one", "delete_one"}:
            try:
                existing_result = self.db.count_lines.find_one(filter_query, projection)
            except TypeError:
                existing_result = self.db.count_lines.find_one(filter_query)
            existing = await self._resolve_awaitable(existing_result)
            if existing and existing.get("session_id"):
                session_ids.add(str(existing["session_id"]))
            return sorted(session_ids)

        try:
            cursor = self.db.count_lines.find(filter_query, projection)
        except TypeError:
            cursor = self.db.count_lines.find(filter_query)
        matched_result = cursor.to_list(length=5000)
        matched = await self._resolve_awaitable(matched_result)
        for doc in matched:
            if isinstance(doc, dict) and doc.get("session_id"):
                session_ids.add(str(doc["session_id"]))
        return sorted(session_ids)

    async def _enforce_variance_for_write(
        self,
        payload: dict[str, Any],
        context: dict[str, Any],
    ) -> None:
        operation = str(payload.get("operation") or "").strip().lower()

        if operation == "insert_one":
            document = payload.get("document")
            if not isinstance(document, dict) or "counted_qty" not in document:
                return
            governance, erp_item, session = await self._evaluate_governance_for_document(
                document, context
            )
            self._apply_authoritative_fields(document, governance, erp_item, session, context)
            return

        if operation == "update_one":
            update_doc = payload.get("update")
            if not isinstance(update_doc, dict):
                return
            set_doc = update_doc.get("$set")
            if not isinstance(set_doc, dict) or "counted_qty" not in set_doc:
                return

            filter_query = payload.get("filter") or {}
            existing = await self._resolve_awaitable(self.db.count_lines.find_one(filter_query))
            merged = dict(existing or {})
            merged.update(set_doc)
            if not merged:
                return
            governance, erp_item, session = await self._evaluate_governance_for_document(
                merged, context
            )
            self._copy_authoritative_baseline_fields(source=merged, target=set_doc)
            self._apply_authoritative_fields(set_doc, governance, erp_item, session, context)
            return

        # update_many/delete mutations intentionally skip variance stamping;
        # callers should use update_one-per-line when quantity is being changed in bulk.

    async def _evaluate_governance_for_document(
        self,
        document: dict[str, Any],
        context: dict[str, Any],
    ) -> tuple[CountLineGovernanceDecision, dict[str, Any], Optional[dict[str, Any]]]:
        item_code = str(document.get("item_code") or context.get("item_code") or "").strip()
        if not item_code:
            raise HTTPException(status_code=409, detail="Count line is missing item_code")

        counted_qty = float(document.get("counted_qty") or 0.0)
        expected_qty = float(document.get("erp_qty") or 0.0)
        session_id = str(document.get("session_id") or context.get("session_id") or "").strip()

        erp_item = context.get("erp_item")
        if not isinstance(erp_item, dict):
            erp_item = None
        if erp_item is None:
            barcode = str(document.get("barcode") or "").strip()
            if barcode:
                erp_item = await self._resolve_awaitable(
                    self.db.erp_items.find_one({"barcode": barcode})
                )
            if erp_item is None:
                erp_item = await self._resolve_awaitable(
                    self.db.erp_items.find_one({"item_code": item_code})
                )
            erp_item = erp_item or {}

        if expected_qty == 0.0 and session_id:
            baseline_qty, baseline_hash = await self.resolve_baseline(
                session_id=session_id,
                item_code=item_code,
                username=str(context.get("username") or "system"),
                erp_item=erp_item,
            )
            expected_qty = baseline_qty
            document.setdefault("erp_qty", baseline_qty)
            document.setdefault("baseline_hash", baseline_hash)

        governance = await self.evaluate_policy(
            item_code=item_code,
            counted_qty=counted_qty,
            expected_qty=expected_qty,
            item=erp_item,
            location=context.get("location") or document.get("floor_no"),
            variance_reason=context.get("variance_reason") or document.get("variance_reason"),
            correction_reason=(
                context.get("correction_reason") if "correction_reason" in context else document.get("correction_reason")
            ),
            require_correction_reason_for_variance=bool(
                context.get("require_correction_reason_for_variance", False)
            ),
        )
        session = await self._resolve_session_document(document, context)
        return governance, erp_item, session

    async def _resolve_session_document(
        self,
        document: dict[str, Any],
        context: dict[str, Any],
    ) -> Optional[dict[str, Any]]:
        explicit_session = context.get("session")
        if isinstance(explicit_session, dict):
            return explicit_session

        session_id = str(document.get("session_id") or context.get("session_id") or "").strip()
        if not session_id:
            return None

        return await self._resolve_awaitable(
            self.db.sessions.find_one(
                {"$or": [{"id": session_id}, {"session_id": session_id}]}
            )
        )

    def _copy_authoritative_baseline_fields(
        self,
        *,
        source: dict[str, Any],
        target: dict[str, Any],
    ) -> None:
        for field in ("erp_qty", "baseline_hash"):
            if field in source and field not in target:
                target[field] = source[field]

    def _collect_risk_flags(
        self,
        *,
        document: dict[str, Any],
        erp_item: dict[str, Any],
        governance: CountLineGovernanceDecision,
        session: Optional[dict[str, Any]],
        counted_qty: float,
        expected_qty: float,
        mrp_erp: float,
        mrp_counted: float,
    ) -> list[str]:
        risk_flags: list[str] = []
        variance = governance.variance
        if expected_qty > 0:
            variance_percent = abs(variance) / expected_qty * 100
        elif counted_qty == 0:
            variance_percent = 0.0
        else:
            variance_percent = 100.0

        mrp_change_percent = ((mrp_counted - mrp_erp) / mrp_erp * 100) if mrp_erp > 0 else 0.0
        correction_reason = document.get("correction_reason")
        variance_reason = document.get("variance_reason")
        serial_numbers = document.get("serial_numbers") or []
        photo_proofs = document.get("photo_proofs") or []

        if abs(variance) > 100 or variance_percent > 50:
            risk_flags.append("LARGE_VARIANCE")
        if mrp_change_percent < -20:
            risk_flags.append("MRP_REDUCED_SIGNIFICANTLY")
        if mrp_erp > 10000 and variance_percent > 5:
            risk_flags.append("HIGH_VALUE_VARIANCE")
        if mrp_erp > 5000 and not serial_numbers:
            risk_flags.append("SERIAL_MISSING_HIGH_VALUE")
        if abs(variance) > 0 and not correction_reason and not variance_reason:
            risk_flags.append("MISSING_CORRECTION_REASON")
        if abs(mrp_change_percent) > 5 and not correction_reason and not variance_reason:
            risk_flags.append("MRP_CHANGE_WITHOUT_REASON")

        photo_required = (
            abs(variance) > 100
            or variance_percent > 50
            or abs(mrp_change_percent) > 20
            or mrp_erp > 10000
        )
        if photo_required and not document.get("photo_base64") and not photo_proofs:
            risk_flags.append("PHOTO_PROOF_REQUIRED")

        expected_floor = str(
            erp_item.get("floor")
            or erp_item.get("floor_no")
            or (erp_item.get("source_data") or {}).get("floor")
            or (erp_item.get("source_data") or {}).get("floor_no")
            or ""
        ).strip().upper()
        expected_rack = str(
            erp_item.get("rack")
            or erp_item.get("rack_no")
            or (erp_item.get("source_data") or {}).get("rack")
            or (erp_item.get("source_data") or {}).get("rack_no")
            or ""
        ).strip().upper()
        found_floor = str(document.get("floor_no") or "").strip().upper()
        found_rack = str(document.get("rack_no") or "").strip().upper()
        floor_mismatch = found_floor and expected_floor and found_floor != expected_floor
        rack_mismatch = found_rack and expected_rack and found_rack != expected_rack
        if floor_mismatch or rack_mismatch:
            risk_flags.append("MISPLACED_ITEM")
            document["is_misplaced"] = True
            document["expected_location"] = f"{expected_floor}/{expected_rack}"
            document["found_location"] = f"{found_floor}/{found_rack}"
            document["relocation_status"] = document.get("relocation_status") or "PENDING"
        else:
            document["is_misplaced"] = bool(document.get("is_misplaced", False))

        if str((session or {}).get("type") or "").upper() == "STRICT" and abs(variance) > 0:
            risk_flags.append("STRICT_MODE_VARIANCE")

        return sorted(set(risk_flags))

    def _apply_review_reset_fields(self, target: dict[str, Any]) -> None:
        target["assigned_to"] = None
        target["recount_requested_at"] = None
        target["recount_requested_by"] = None
        target["rejected_at"] = None
        target["rejected_by"] = None
        target["rejection_reason"] = None
        target["verified"] = False
        target["verified_at"] = None
        target["verified_by"] = None
        if "approval_note" in target or target.get("approval_note") is not None:
            target["approval_note"] = None

    def _apply_authoritative_fields(
        self,
        target: dict[str, Any],
        governance: CountLineGovernanceDecision,
        erp_item: dict[str, Any],
        session: Optional[dict[str, Any]],
        context: dict[str, Any],
    ) -> None:
        counted_qty = _as_float(target.get("counted_qty"))
        expected_qty = _as_float(target.get("erp_qty"))
        mrp_erp = _as_float(
            target.get("mrp_erp")
            or erp_item.get("mrp")
            or erp_item.get("sale_price")
            or erp_item.get("sales_price")
        )
        mrp_counted = _as_float(
            target.get("mrp_counted")
            or target.get("counted_mrp")
            or target.get("mrp")
            or mrp_erp
        )
        target["item_name"] = target.get("item_name") or erp_item.get("item_name") or "Unknown"
        if not target.get("barcode") and erp_item.get("barcode"):
            target["barcode"] = erp_item.get("barcode")
        target["mrp_erp"] = mrp_erp
        target["mrp_counted"] = mrp_counted
        target["financial_impact"] = (mrp_counted * counted_qty) - (mrp_erp * expected_qty)
        target["risk_flags"] = self._collect_risk_flags(
            document=target,
            erp_item=erp_item,
            governance=governance,
            session=session,
            counted_qty=counted_qty,
            expected_qty=expected_qty,
            mrp_erp=mrp_erp,
            mrp_counted=mrp_counted,
        )
        set_status = bool(context.get("set_status_from_governance", True))
        self._apply_review_reset_fields(target)
        target["variance"] = governance.variance
        target["approval_status"] = governance.approval_status
        target["approved_at"] = governance.approved_at
        target["approved_by"] = governance.approved_by
        target["requires_supervisor_approval"] = governance.requires_supervisor_approval
        target["variance_data"] = governance.variance_data
        target["violated_thresholds"] = governance.violated_thresholds
        if set_status:
            target["status"] = governance.status
