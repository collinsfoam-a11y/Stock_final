from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field


class CountObservation(BaseModel):
    id: str
    session_id: str
    item_code: str
    item_name: Optional[str] = None
    counted_qty: float
    base_uom: Optional[str] = None
    uom_code: Optional[str] = None
    uom_name: Optional[str] = None
    conversion_factor: Optional[float] = 1.0
    quantity_precision: Optional[int] = None
    batches: Optional[list[dict]] = None
    serial_entries: Optional[list[dict]] = None
    split_section: Optional[str] = None
    split_total: Optional[float] = None
    mrp_counted: Optional[float] = None
    manufacturing_date: Optional[str] = None
    expiry_date: Optional[str] = None
    barcode: Optional[str] = None
    batch_id: Optional[str] = None
    damaged_qty: Optional[float] = 0
    non_returnable_damaged_qty: Optional[float] = 0
    item_condition: Optional[str] = None
    floor_no: Optional[str] = None
    rack_no: Optional[str] = None
    mark_location: Optional[str] = None
    location_id: Optional[str] = None
    remark: Optional[str] = None
    photo_proofs: Optional[list[dict]] = None
    parameter_checks: Optional[dict] = None
    accessory_checks: Optional[dict] = None
    version: int = 1
    previous_version_id: Optional[str] = None
    status: str = "DRAFT"
    approval_status: Optional[str] = None
    sql_qty_at_submission: Optional[float] = None
    sql_qty_at_recount: Optional[float] = None
    sql_quantity_source: Optional[str] = None
    sql_comparison_source: Optional[str] = None
    variance: Optional[float] = None
    exception_types: Optional[list[str]] = None
    exception_details: Optional[list[dict]] = None
    system_recommendation: Optional[str] = None
    supervisor_decision: Optional[str] = None
    supervisor_notes: Optional[str] = None
    decided_by: Optional[str] = None
    decided_at: Optional[datetime] = None
    additional_location_response: Optional[str] = None
    linked_location_task_id: Optional[str] = None
    is_recount: bool = False
    recount_of_id: Optional[str] = None
    recount_is_blind: bool = False
    recount_original_hidden_fields: Optional[dict] = None
    idempotency_key: Optional[str] = None
    scan_fingerprint: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    finalized_at: Optional[datetime] = None
    finalized_by: Optional[str] = None


class RecountRequest(BaseModel):
    id: str
    observation_id: str
    session_id: str
    item_code: str
    requested_by: str
    request_reason: str
    scope: str = "ITEM"
    batch_or_serial_scope: Optional[str] = None
    location_id: Optional[str] = None
    required_evidence: Optional[list[str]] = None
    priority: str = "NORMAL"
    is_blind: bool = True
    status: str = "RECOUNT_REQUESTED"
    assigned_to: Optional[str] = None
    assigned_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    linked_recount_observation_id: Optional[str] = None


class AdditionalLocationInvestigation(BaseModel):
    id: str
    observation_id: str
    session_id: str
    item_code: str
    response: str
    suspected_location: Optional[str] = None
    observed_or_estimated_qty: Optional[float] = None
    staff_remark: Optional[str] = None
    photo_urls: Optional[list[str]] = None
    staff_confidence: Optional[str] = None
    linked_verification_task_id: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class ApprovalDecision(BaseModel):
    id: str
    observation_id: Optional[str] = None
    recount_request_id: Optional[str] = None
    session_id: Optional[str] = None
    decided_by: str
    decided_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    action: str
    reason: Optional[str] = None
    notes: Optional[str] = None
    corrected_classification: Optional[str] = None
    target_batch_id: Optional[str] = None
    damage_case_id: Optional[str] = None
    linked_verification_task_id: Optional[str] = None
    observation_snapshot: Optional[dict] = None


class SupervisorReviewCard(BaseModel):
    observation_id: str
    session_id: str
    queue_type: str
    staff_user: str
    staff_name: Optional[str] = None
    location: Optional[str] = None
    item_identity: dict
    tracking_mode: Optional[str] = None
    baseline_qty: Optional[float] = None
    sql_qty_at_submission: Optional[float] = None
    physical_qty: float
    variance: Optional[float] = None
    batch_details: Optional[list[dict]] = None
    serial_details: Optional[list[dict]] = None
    split_count_calculation: Optional[dict] = None
    mandatory_remark: Optional[str] = None
    additional_location_response: Optional[str] = None
    parameter_differences: Optional[list[dict]] = None
    photos: Optional[list[str]] = None
    previous_count_versions: Optional[list[dict]] = None
    system_recommendation: str
    exception_types: Optional[list[str]] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class SessionApprovalSummary(BaseModel):
    session_id: str
    total_observations: int = 0
    auto_approved: int = 0
    supervisor_approved: int = 0
    recount_requested: int = 0
    pending_investigation: int = 0
    sync_conflicts: int = 0
    blocking_items: Optional[list[str]] = None


class RecountComparisonResult(BaseModel):
    original_observation_id: str
    recount_observation_id: str
    original_count: float
    recount_count: float
    sql_at_recount: float
    difference: float
    matches_sql: bool
    decision: str
    original_variance: Optional[float] = None
    recount_variance: Optional[float] = None


class AutoApprovalRuleResult(BaseModel):
    rule_name: str
    passed: bool
    detail: Optional[str] = None


class AutoApprovalResult(BaseModel):
    observation_id: str
    approved: bool
    rules_passed: list[dict]
    sql_quantity_source: Optional[str] = None
    sql_comparison_source: Optional[str] = None
    block_reason: Optional[str] = None
