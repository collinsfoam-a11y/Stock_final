"""
Approval Engine Service

Evaluates whether physical observations can be auto-approved, must go to
supervisor review, or require additional-location investigation.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from backend.models.approval import (
    AdditionalLocationInvestigation,
    AutoApprovalResult,
)
from backend.api.schemas import (
    AdditionalLocationResponse,
    ApprovalExceptionDetail,
    ApprovalExceptionType,
    SqlAvailability,
    SqlComparisonSource,
    SystemRecommendation,
)

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class ApprovalEngine:
    def __init__(self):
        pass

    async def evaluate(
        self,
        observation: dict[str, Any],
        db,
    ) -> AutoApprovalResult:
        observation_id = observation.get("id") or observation.get("_id")
        if not observation_id:
            return AutoApprovalResult(
                observation_id="unknown",
                approved=False,
                rules_passed=[],
                sql_quantity_source=SqlAvailability.UNAVAILABLE,
                sql_comparison_source=None,
                block_reason="missing_observation_id",
            )

        sql_qty = observation.get("sql_qty_at_submission")
        sql_source = await self._determine_sql_source(observation)
        exceptions: list[ApprovalExceptionDetail] = []
        rules: list[dict] = []

        if not sql_qty and sql_source != SqlAvailability.AVAILABLE_AT_SYNC:
            rules.append({"rule_name": "sql_fetched_at_submission", "passed": False, "detail": "SQL unavailable at submission"})
            return AutoApprovalResult(
                observation_id=str(observation_id),
                approved=False,
                rules_passed=rules,
                sql_quantity_source=sql_source,
                sql_comparison_source=None,
                block_reason="sql_unavailable",
            )

        if sql_qty is None:
            sql_qty = 0.0

        physical_qty = float(observation.get("counted_qty") or 0)
        variance = self._compute_variance(physical_qty, sql_qty)
        observation["variance"] = variance
        rules.append({"rule_name": "sql_fetched_at_submission", "passed": True, "detail": str(sql_qty)})

        batch_ok = self._check_batch_variance(observation, db)
        rules.append({"rule_name": "batch_variance", "passed": batch_ok.passed, "detail": batch_ok.detail})
        if not batch_ok.passed:
            exceptions.append(self._exception(ApprovalExceptionType.BATCH_VARIANCE, batch_ok.detail))

        serial_ok = self._check_serial_integrity(observation, db)
        rules.append({"rule_name": "serial_integrity", "passed": serial_ok.passed, "detail": serial_ok.detail})
        if not serial_ok.passed:
            exceptions.append(self._exception(ApprovalExceptionType.SERIAL_CONFLICT, serial_ok.detail))

        attr_ok = self._check_attribute_mismatch(observation)
        rules.append({"rule_name": "attribute_match", "passed": attr_ok.passed, "detail": attr_ok.detail})
        if not attr_ok.passed:
            exceptions.append(self._exception(ApprovalExceptionType.ATTRIBUTE_MISMATCH, attr_ok.detail))

        location_ok = self._check_location_policy(observation)
        rules.append({"rule_name": "location_policy", "passed": location_ok.passed, "detail": location_ok.detail})
        if not location_ok.passed:
            exceptions.append(self._exception(ApprovalExceptionType.LOCATION_MISMATCH, location_ok.detail))

        damage_ok = self._check_damaged_stock(observation)
        rules.append({"rule_name": "damaged_stock", "passed": damage_ok.passed, "detail": damage_ok.detail})
        if not damage_ok.passed:
            exceptions.append(self._exception(ApprovalExceptionType.DAMAGED_STOCK, damage_ok.detail))

        provisional_ok = self._check_provisional(observation)
        rules.append({"rule_name": "provisional_items", "passed": provisional_ok.passed, "detail": provisional_ok.detail})
        if not provisional_ok.passed:
            exceptions.append(self._exception(ApprovalExceptionType.PROVISIONAL_BATCH, provisional_ok.detail))

        additional_ok = self._check_additional_location_investigation(observation, db)
        rules.append({"rule_name": "additional_location", "passed": additional_ok.passed, "detail": additional_ok.detail})
        if not additional_ok.passed:
            exceptions.append(self._exception(ApprovalExceptionType.LOCATION_INVESTIGATION, additional_ok.detail))

        remark_ok = self._check_mandatory_remark(observation)
        rules.append({"rule_name": "mandatory_remark", "passed": remark_ok.passed, "detail": remark_ok.detail})
        if not remark_ok.passed:
            exceptions.append(self._exception(ApprovalExceptionType.INCOMPLETE_EVIDENCE, remark_ok.detail))

        param_ok = self._check_required_parameters(observation)
        rules.append({"rule_name": "required_parameters", "passed": param_ok.passed, "detail": param_ok.detail})
        if not param_ok.passed:
            exceptions.append(self._exception(ApprovalExceptionType.ATTRIBUTE_MISMATCH, param_ok.detail))

        accessory_ok = self._check_accessory_completeness(observation)
        rules.append({"rule_name": "accessory_checks", "passed": accessory_ok.passed, "detail": accessory_ok.detail})
        if not accessory_ok.passed:
            exceptions.append(self._exception(ApprovalExceptionType.INCOMPLETE_EVIDENCE, accessory_ok.detail))

        photo_ok = self._check_photo_evidence(observation, db)
        rules.append({"rule_name": "photo_evidence", "passed": photo_ok.passed, "detail": photo_ok.detail})
        if not photo_ok.passed:
            exceptions.append(self._exception(ApprovalExceptionType.INCOMPLETE_EVIDENCE, photo_ok.detail))

        conf_ok = await self._check_concurrent_conflict(observation, db)
        rules.append({"rule_name": "concurrent_conflict", "passed": conf_ok.passed, "detail": conf_ok.detail})
        if not conf_ok.passed:
            exceptions.append(self._exception(ApprovalExceptionType.CONCURRENT_OBSERVATION, conf_ok.detail))

        sync_ok = self._check_sync_conflict(observation)
        rules.append({"rule_name": "sync_conflict", "passed": sync_ok.passed, "detail": sync_ok.detail})
        if not sync_ok.passed:
            exceptions.append(self._exception(ApprovalExceptionType.SYNC_CONFLICT, sync_ok.detail))

        threshold_ok = self._check_policy_thresholds(observation)
        rules.append({"rule_name": "policy_thresholds", "passed": threshold_ok.passed, "detail": threshold_ok.detail})
        if not threshold_ok.passed:
            exceptions.append(self._exception(ApprovalExceptionType.POLICY_THRESHOLD, threshold_ok.detail))

        approved = len(exceptions) == 0 and variance == 0.0
        system_recommendation = SystemRecommendation.AUTO_APPROVE if approved else SystemRecommendation.SUPERVISOR_REVIEW
        if sql_source == SqlAvailability.UNAVAILABLE:
            system_recommendation = SystemRecommendation.PENDING_SQL

        observation["exception_types"] = [e.exception_type for e in exceptions]
        observation["exception_details"] = [e.model_dump() for e in exceptions]
        observation["system_recommendation"] = system_recommendation
        if variance:
            observation["variance"] = variance
        else:
            observation["variance"] = 0.0

        if approved:
            observation["status"] = CountObservationStatus.AUTO_APPROVED.value
            observation["approval_status"] = "AUTO_APPROVED"
        else:
            observation["status"] = CountObservationStatus.SUPERVISOR_REVIEW.value
            observation["approval_status"] = "SUPERVISOR_REVIEW"

        return AutoApprovalResult(
            observation_id=str(observation_id),
            approved=approved,
            rules_passed=rules,
            sql_quantity_source=sql_source,
            sql_comparison_source=sql_source.value if sql_source.value != SqlAvailability.UNAVAILABLE.value else None,
            block_reason="; ".join(e.description or e.exception_type.value for e in exceptions) if not approved else None,
        )

    async def _determine_sql_source(self, observation: dict[str, Any]) -> SqlAvailability:
        sql_at_submission = observation.get("sql_qty_at_submission")
        if sql_at_submission is not None:
            return SqlAvailability.AVAILABLE_AT_SUBMISSION
        reconstructed = observation.get("reconstructed_qty")
        if reconstructed is not None:
            return SqlAvailability.RECONSTRUCTED
        sql_at_sync = observation.get("sql_qty_at_recount") or observation.get("sql_quantity")
        if sql_at_sync is not None:
            return SqlAvailability.AVAILABLE_AT_SYNC
        return SqlAvailability.UNAVAILABLE

    def _compute_variance(self, physical: float, sql_qty: float) -> float:
        return round(physical - sql_qty, 4)

    def _exception(self, exception_type: ApprovalExceptionType, detail: Optional[str] = None) -> ApprovalExceptionDetail:
        return ApprovalExceptionDetail(exception_type=exception_type, description=detail, is_blocking=True)

    def _check_batch_variance(self, observation: dict[str, Any], db) -> "RuleResult":
        batches = observation.get("batches") or []
        if not batches:
            return self._ok("no_batches")
        sql_qty = float(observation.get("sql_qty_at_submission") or 0)
        physical_total = sum(float(b.get("counted_qty") or 0) for b in batches)
        sql_total = sum(float(b.get("sql_qty") or 0) for b in batches)
        if abs(physical_total - sql_total) > 0.0001:
            return self._fail("batch_wise_variance", f"physical={physical_total}, sql={sql_total}")
        return self._ok("batch_variance_match")

    def _check_serial_integrity(self, observation: dict[str, Any], db) -> "RuleResult":
        entries = observation.get("serial_entries") or []
        if not entries:
            return self._ok("no_serials")
        serials = [e.get("serial_number") for e in entries if e.get("serial_number")]
        seen = set()
        dupes = []
        for serial in serials:
            if serial in seen:
                dupes.append(serial)
            seen.add(serial)
        if dupes:
            return self._fail("duplicate_serials", ",".join(dupes))
        return self._ok("serial_unique")

    def _check_attribute_mismatch(self, observation: dict[str, Any]) -> "RuleResult":
        mrp_counted = observation.get("mrp_counted")
        mrp_sql = observation.get("mrp_sql")
        if mrp_counted is not None and mrp_sql is not None and mrp_counted != mrp_sql:
            return self._fail("mrp_mismatch", f"counted={mrp_counted}, sql={mrp_sql}")
        mfg = observation.get("manufacturing_date")
        expiry = observation.get("expiry_date")
        mfg_sql = observation.get("manufacturing_date_sql")
        expiry_sql = observation.get("expiry_date_sql")
        if (mfg and mfg_sql and mfg != mfg_sql) or (expiry and expiry_sql and expiry != expiry_sql):
            return self._fail("date_mismatch")
        return self._ok("attributes_match")

    def _check_location_policy(self, observation: dict[str, Any]) -> "RuleResult":
        expected = observation.get("expected_location")
        actual = observation.get("location_id") or observation.get("mark_location") or observation.get("rack_no")
        if expected and actual and expected != actual:
            return self._fail("location_mismatch", f"expected={expected}, actual={actual}")
        return self._ok("location_ok")

    def _check_damaged_stock(self, observation: dict[str, Any]) -> "RuleResult":
        damaged = float(observation.get("damaged_qty") or 0)
        non_returnable = float(observation.get("non_returnable_damaged_qty") or 0)
        condition = observation.get("item_condition")
        if damaged > 0 or non_returnable > 0 or condition:
            return self._fail("damaged_or_condition", f"damaged={damaged}, nr={non_returnable}, condition={condition}")
        return self._ok("no_damage")

    def _check_provisional(self, observation: dict[str, Any]) -> "RuleResult":
        is_provisional = observation.get("is_provisional_batch") or observation.get("is_provisional_bundle") or observation.get("is_new_bundle")
        barcode = observation.get("barcode") or ""
        if is_provisional or barcode.startswith("500100"):
            return self._fail("provisional_or_internal_barcode")
        return self._ok("not_provisional")

    async def _check_additional_location_investigation(
        self, observation: dict[str, Any], db
    ) -> "RuleResult":
        session_id = observation.get("session_id")
        item_code = observation.get("item_code")
        if not session_id or not item_code:
            return self._ok("no_investigation_checkable")
        coll = db["additional_location_investigations"] if db else None
        if not coll:
            return self._ok("no_db")
        cursor = coll.find(
            {"observation_id": observation.get("id"), "response": AdditionalLocationResponse.NOT_CHECKED.value}
        )
        results = await cursor.to_list(length=1)
        if results:
            return self._fail("pending_investigation")
        return self._ok("investigation_clear")

    def _check_mandatory_remark(self, observation: dict[str, Any]) -> "RuleResult":
        remark = (observation.get("remark") or "").strip()
        if not remark:
            return self._fail("missing_remark")
        return self._ok("remark_present")

    def _check_required_parameters(self, observation: dict[str, Any]) -> "RuleResult":
        checks = observation.get("parameter_checks") or {}
        missing = [k for k, v in checks.items() if not v]
        if missing:
            return self._fail("missing_parameters", ",".join(missing))
        return self._ok("parameters_complete")

    def _check_accessory_completeness(self, observation: dict[str, Any]) -> "RuleResult":
        checks = observation.get("accessory_checks") or {}
        if not isinstance(checks, dict):
            return self._ok("no_checks")
        missing = [k for k, v in checks.items() if not v]
        if missing:
            return self._fail("missing_accessories", ",".join(missing))
        return self._ok("accessories_complete")

    def _check_photo_evidence(self, observation: dict[str, Any], db) -> "RuleResult":
        photos = observation.get("photo_proofs") or []
        requires_photos = True
        if not requires_photos:
            return self._ok("photos_not_required")
        if not photos:
            return self._fail("missing_photos")
        return self._ok("photos_present")

    async def _check_concurrent_conflict(self, observation: dict[str, Any], db) -> "RuleResult":
        session_id = observation.get("session_id")
        item_code = observation.get("item_code")
        if not session_id or not item_code:
            return self._ok("no_conflict_checkable")
        coll = db["count_observations"] if db else None
        if not coll:
            return self._ok("no_db")
        cursor = coll.find({"session_id": session_id, "item_code": item_code, "status": {"$nin": [CountObservationStatus.APPROVED.value, CountObservationStatus.AUTO_APPROVED.value]}})
        results = await cursor.to_list(length=2)
        for doc in results:
            if str(doc.get("id")) != str(observation.get("id")):
                return self._fail("concurrent_observation")
        return self._ok("no_conflict")

    def _check_sync_conflict(self, observation: dict[str, Any]) -> "RuleResult":
        sync_status = observation.get("sync_status")
        if sync_status in ("conflict", "failed"):
            return self._fail("sync_conflict", sync_status)
        return self._ok("sync_ok")

    def _check_policy_thresholds(self, observation: dict[str, Any]) -> "RuleResult":
        variance = float(observation.get("variance") or 0)
        counted_qty = float(observation.get("counted_qty") or 0)
        if counted_qty > 0:
            pct = abs(variance / counted_qty) * 100
            if pct > 50:
                return self._fail("high_variance_pct", f"{pct:.1f}%")
        return self._ok("threshold_ok")

    def _ok(self, detail: str) -> "RuleResult":
        return RuleResult(passed=True, detail=detail)

    def _fail(self, detail: str, extra: Optional[str] = None) -> "RuleResult":
        return RuleResult(passed=False, detail=f"{detail}:{extra}" if extra else detail)


class RuleResult:
    def __init__(self, passed: bool, detail: Optional[str] = None):
        self.passed = passed
        self.detail = detail
