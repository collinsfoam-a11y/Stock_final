from datetime import datetime, timezone

from pydantic import BaseModel, Field


class CountObservation(BaseModel):
    id: str
    session_id: str
    item_code: str
    item_name: str | None = None
    counted_qty: float
    base_uom: str | None = None
    uom_code: str | None = None
    uom_name: str | None = None
    conversion_factor: float | None = 1.0
    quantity_precision: int | None = None
    batches: list[dict] | None = None
    serial_entries: list[dict] | None = None
    split_section: str | None = None
    split_total: float | None = None
    mrp_counted: float | None = None
    manufacturing_date: str | None = None
    expiry_date: str | None = None
    barcode: str | None = None
    batch_id: str | None = None
    damaged_qty: float | None = 0
    non_returnable_damaged_qty: float | None = 0
    item_condition: str | None = None
    floor_no: str | None = None
    rack_no: str | None = None
    mark_location: str | None = None
    location_id: str | None = None
    remark: str | None = None
    photo_proofs: list[dict] | None = None
    parameter_checks: dict | None = None
    accessory_checks: dict | None = None
    version: int = 1
    previous_version_id: str | None = None
    status: str = "DRAFT"
    approval_status: str | None = None
    sql_qty_at_submission: float | None = None
    sql_qty_at_recount: float | None = None
    sql_quantity_source: str | None = None
    sql_comparison_source: str | None = None
    variance: float | None = None
    exception_types: list[str] | None = None
    exception_details: list[dict] | None = None
    system_recommendation: str | None = None
    supervisor_decision: str | None = None
    supervisor_notes: str | None = None
    decided_by: str | None = None
    decided_at: datetime | None = None
    additional_location_response: str | None = None
    linked_location_task_id: str | None = None
    is_recount: bool = False
    recount_of_id: str | None = None
    recount_is_blind: bool = False
    recount_original_hidden_fields: dict | None = None
    idempotency_key: str | None = None
    scan_fingerprint: str | None = None
    created_by: str | None = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    finalized_at: datetime | None = None
    finalized_by: str | None = None


class RecountRequest(BaseModel):
    id: str
    observation_id: str
    session_id: str
    item_code: str
    requested_by: str
    request_reason: str
    scope: str = "ITEM"
    batch_or_serial_scope: str | None = None
    location_id: str | None = None
    required_evidence: list[str] | None = None
    priority: str = "NORMAL"
    is_blind: bool = True
    status: str = "RECOUNT_REQUESTED"
    assigned_to: str | None = None
    assigned_at: datetime | None = None
    started_at: datetime | None = None
    submitted_at: datetime | None = None
    resolved_at: datetime | None = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    linked_recount_observation_id: str | None = None


class AdditionalLocationInvestigation(BaseModel):
    id: str
    observation_id: str
    session_id: str
    item_code: str
    response: str
    suspected_location: str | None = None
    observed_or_estimated_qty: float | None = None
    staff_remark: str | None = None
    photo_urls: list[str] | None = None
    staff_confidence: str | None = None
    linked_verification_task_id: str | None = None
    created_by: str | None = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )


class ApprovalDecision(BaseModel):
    id: str
    observation_id: str | None = None
    recount_request_id: str | None = None
    session_id: str | None = None
    decided_by: str
    decided_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    action: str
    reason: str | None = None
    notes: str | None = None
    corrected_classification: str | None = None
    target_batch_id: str | None = None
    damage_case_id: str | None = None
    linked_verification_task_id: str | None = None
    observation_snapshot: dict | None = None


class SupervisorReviewCard(BaseModel):
    observation_id: str
    session_id: str
    queue_type: str
    staff_user: str
    staff_name: str | None = None
    location: str | None = None
    item_identity: dict
    tracking_mode: str | None = None
    baseline_qty: float | None = None
    sql_qty_at_submission: float | None = None
    physical_qty: float
    variance: float | None = None
    batch_details: list[dict] | None = None
    serial_details: list[dict] | None = None
    split_count_calculation: dict | None = None
    mandatory_remark: str | None = None
    additional_location_response: str | None = None
    parameter_differences: list[dict] | None = None
    photos: list[str] | None = None
    previous_count_versions: list[dict] | None = None
    system_recommendation: str
    exception_types: list[str] | None = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )


class SessionApprovalSummary(BaseModel):
    session_id: str
    total_observations: int = 0
    auto_approved: int = 0
    supervisor_approved: int = 0
    recount_requested: int = 0
    pending_investigation: int = 0
    sync_conflicts: int = 0
    blocking_items: list[str] | None = None


class RecountComparisonResult(BaseModel):
    original_observation_id: str
    recount_observation_id: str
    original_count: float
    recount_count: float
    sql_at_recount: float
    difference: float
    matches_sql: bool
    decision: str
    original_variance: float | None = None
    recount_variance: float | None = None


class AutoApprovalRuleResult(BaseModel):
    rule_name: str
    passed: bool
    detail: str | None = None


class AutoApprovalResult(BaseModel):
    observation_id: str
    approved: bool
    rules_passed: list[dict]
    sql_quantity_source: str | None = None
    sql_comparison_source: str | None = None
    block_reason: str | None = None
