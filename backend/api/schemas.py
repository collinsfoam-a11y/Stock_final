import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, Field, field_validator, model_validator

from backend.models.base import StrictBaseModel

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    success: bool
    data: T | None = None
    error: dict[str, Any] | None = Field(default=None)
    message: str | None = None
    payload_version: str = "1.0"

    model_config = {
        "json_schema_extra": {"examples": []},
        # Exclude None values from serialization to avoid validation issues
    }

    @classmethod
    def success_response(cls, data: T, message: str | None = None):
        return cls(success=True, data=data, error=None, message=message)

    @classmethod
    def error_response(cls, error: dict[str, Any]):
        return cls(success=False, error=error)


class ERPItem(BaseModel):
    model_config = {"extra": "ignore"}  # Ignore extra fields from MongoDB

    item_code: str = ""
    item_name: str = ""
    barcode: str = ""
    stock_qty: float = 0.0
    mrp: float = 0.0
    category: str | None = None
    subcategory: str | None = None
    warehouse: str | None = None
    location: str | None = None
    uom_code: str | None = None
    uom_name: str | None = None
    hsn_code: str | None = None
    gst_category: str | None = None
    gst_percent: float | None = None
    sgst_percent: float | None = None
    cgst_percent: float | None = None
    igst_percent: float | None = None
    floor: str | None = None
    rack: str | None = None
    verified: bool | None = False
    verified_by: str | None = None
    verified_at: datetime | None = None
    last_scanned_at: datetime | None = None
    verified_qty: float | None = None
    variance: float | None = None
    damaged_qty: float | None = None
    non_returnable_damaged_qty: float | None = None
    item_condition: str | None = None
    manual_barcode: str | None = None
    serial_number: str | None = None
    is_serialized: bool | None = None
    verified_floor: str | None = None
    verified_rack: str | None = None
    image_url: str | None = None
    # Sales / pricing metadata
    sales_price: float | None = None
    sale_price: float | None = None
    standard_rate: float | None = None
    last_purchase_rate: float | None = None
    last_purchase_price: float | None = None
    # Brand metadata
    brand_id: str | None = None
    brand_name: str | None = None
    brand_code: str | None = None
    # Supplier metadata
    supplier_id: str | None = None
    supplier_code: str | None = None
    supplier_name: str | None = None
    last_purchase_supplier: str | None = None
    supplier_phone: str | None = None
    supplier_city: str | None = None
    supplier_state: str | None = None
    supplier_gst: str | None = None
    # Purchase info
    purchase_price: float | None = None
    last_purchase_qty: float | None = None
    purchase_qty: float | None = None
    purchase_invoice_no: str | None = None
    purchase_reference: str | None = None
    last_purchase_date: datetime | None = None
    last_purchase_cost: float | None = None
    purchase_voucher_type: str | None = None
    purchase_type: str | None = None
    batch_id: int | str | None = None
    batch_no: str | None = None
    manufacturing_date: str | None = None
    expiry_date: str | None = None

    # SQL Verification fields
    sql_verified_qty: float | None = None
    last_sql_verified_at: datetime | None = None
    mongo_cached_qty_previous: float | None = None
    sql_qty_mismatch_flag: bool | None = None
    sql_verification_status: str | None = None


class UserInfo(BaseModel):
    id: str
    username: str
    full_name: str
    role: str
    email: str | None = None
    employee_id: str | None = None
    phone: str | None = None
    is_active: bool = True
    permissions: list[str] = Field(default_factory=list)
    has_pin: bool = False


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserInfo


class UserRegister(BaseModel):
    username: str
    password: str
    full_name: str
    role: Literal["staff", "supervisor", "admin"] = "staff"
    employee_id: str | None = None
    phone: str | None = None


class UserLogin(BaseModel):
    username: str
    password: str


class PinLogin(BaseModel):
    """PIN-based login for staff users (4-digit numeric PIN)."""

    pin: str
    username: str | None = None


class PinSetup(BaseModel):
    pin: str
    confirm_pin: str

    @model_validator(mode="after")
    def validate_pins_match(self) -> "PinSetup":
        weak_pins = {
            "1234",
            "0000",
            "1111",
            "2222",
            "3333",
            "4444",
            "5555",
            "6666",
            "7777",
            "8888",
            "9999",
            "4321",
        }
        if self.pin != self.confirm_pin:
            raise ValueError("PINs do not match")
        if not self.pin.isdigit() or len(self.pin) != 4:
            raise ValueError("PIN must be 4 digits")
        if self.pin in weak_pins:
            raise ValueError("PIN is too weak")
        return self


class CorrectionReason(BaseModel):
    code: str
    description: str


class PhotoProof(BaseModel):
    id: str
    url: str
    timestamp: datetime


class CorrectionMetadata(BaseModel):
    reason_code: str
    notes: str | None = None
    approved_by: str | None = None
    approved_at: datetime | None = None


class DateFormatType(str, Enum):
    """Date format type for manufacturing and expiry dates"""

    FULL = "full"  # DD/MM/YYYY
    MONTH_YEAR = "month_year"  # MM/YYYY
    YEAR_ONLY = "year_only"  # YYYY
    NONE = "none"  # No date


class SerialEntry(BaseModel):
    """Enhanced serial entry with per-serial attributes"""

    serial_number: str
    mrp: float | None = None
    manufacturing_date: str | None = None
    mfg_date_format: DateFormatType | None = None
    expiry_date: str | None = None
    expiry_date_format: DateFormatType | None = None


class RelocationStatus(str, Enum):
    PENDING = "PENDING"
    MOVED = "MOVED"
    IGNORED = "IGNORED"


class CountLineCreate(StrictBaseModel):
    session_id: str
    location_id: str | None = None
    floor_id: str | None = None
    rack_id: str | None = None
    item_code: str
    item_name: str | None = None
    idempotency_key: str | None = None
    recount_of_id: str | None = None
    barcode: str | None = None
    batch_id: str | None = None
    batches: list[dict[str, Any]] | None = None
    variant_id: str | None = None
    variant_barcode: str | None = None
    mrp_source: str | None = None
    condition_details: str | None = None
    counted_qty: float
    input_qty: float | None = None
    input_uom: str | None = None
    base_uom: str | None = None
    uom_code: str | None = None
    uom_name: str | None = None
    conversion_factor: float | None = 1.0
    quantity_precision: int | None = None
    damaged_qty: float | None = 0
    non_returnable_damaged_qty: float | None = 0
    damage_included: bool | None = None
    item_condition: str | None = None
    floor_no: str | None = None
    rack_no: str | None = None
    mark_location: str | None = None
    sr_no: str | None = None
    manufacturing_date: str | None = None
    mfg_date_format: DateFormatType | None = None
    expiry_date: str | None = None
    expiry_date_format: DateFormatType | None = None
    variance_reason: str | None = None
    variance_note: str | None = None
    remark: str | None = None
    photo_base64: str | None = None
    mrp_counted: float | None = None
    split_section: str | None = None
    serial_numbers: list[str] | None = None
    serial_entries: list[SerialEntry] | None = None
    correction_reason: CorrectionReason | None = None
    photo_proofs: list[PhotoProof] | None = None
    correction_metadata: CorrectionMetadata | None = None
    category_correction: str | None = None
    subcategory_correction: str | None = None

    # Misplaced Stock Fields
    is_misplaced: bool | None = False
    expected_location: str | None = None
    found_location: str | None = None
    relocation_status: RelocationStatus | None = None

    # Lineage / Conflict Governance Fields
    version: int = 1
    previous_version_id: str | None = None

    @model_validator(mode="after")
    def normalize_location_context(self) -> "CountLineCreate":
        """Keep backward compatibility while preferring canonical location IDs."""
        loc_id = str(self.location_id).strip() if self.location_id else None
        flr_id = str(self.floor_id).strip() if self.floor_id else None
        rck_id = str(self.rack_id).strip() if self.rack_id else None
        flr_no = str(self.floor_no).strip() if self.floor_no else None
        rck_no = str(self.rack_no).strip() if self.rack_no else None

        if not flr_id and flr_no:
            flr_id = flr_no
        if not rck_id and rck_no:
            rck_id = rck_no

        object.__setattr__(self, "location_id", loc_id)
        object.__setattr__(self, "floor_id", flr_id)
        object.__setattr__(self, "rack_id", rck_id)
        object.__setattr__(self, "floor_no", flr_no)
        object.__setattr__(self, "rack_no", rck_no)
        return self


class BulkCountLineUpdate(StrictBaseModel):
    count_line_ids: list[str]
    notes: str | None = None


class Session(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    warehouse: str
    location_id: str | None = None
    location_key: str | None = None
    location_type: str | None = None
    location_name: str | None = None
    rack_no: str | None = None
    staff_user: str
    staff_name: str
    status: str = "OPEN"  # OPEN, ACTIVE, CLOSED, PAUSED, SUBMITTED, SUPERVISOR_REVIEW, RECOUNT_REQUIRED, APPROVED, COMPLETED, FINALISED, CANCELLED, AUTO_RELEASED
    approval_status: str | None = None
    auto_release_reason: str | None = None
    approval_summary: dict | None = None
    blocking_items: list[str] | None = None
    type: str = "STANDARD"  # STANDARD, BLIND, STRICT
    started_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    last_heartbeat: datetime | None = None
    closed_at: datetime | None = None
    completed_at: datetime | None = None
    reconciled_at: datetime | None = None
    finalized_at: datetime | None = None
    finalized_by: str | None = None
    finalization_status: str | None = None
    total_items: int = 0
    total_variance: float = 0
    verified_items: int = 0
    pending_items: int = 0
    damage_items: int = 0
    notes: str | None = None
    barcode: str | None = None

    # Governance Fields
    config_version_id: str | None = None
    snapshot_hash: str | None = None
    # Reference to external storage if too large
    snapshot_items_ref: str | None = None

    @field_validator(
        "last_heartbeat",
        "closed_at",
        "completed_at",
        "reconciled_at",
        "finalized_at",
        mode="before",
    )
    @classmethod
    def normalize_empty_datetime_fields(cls, v: Any) -> Any:
        return None if v == "" else v

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, v: Any) -> str:
        if isinstance(v, str):
            v = v.upper()
            if v == "RECONCILE":
                return "ACTIVE"
            return v
        return v

    @model_validator(mode="after")
    def compute_legacy_status(self) -> "Session":
        # If session is ACTIVE but has reconciled_at, present it as RECONCILE
        # to frontend. This maintains backward compatibility while normalizing
        # DB state to ACTIVE.
        if self.status == "ACTIVE" and self.reconciled_at and not self.closed_at:
            self.status = "RECONCILE"
        return self


class SessionCreate(BaseModel):
    warehouse: str
    type: str | None = "STANDARD"
    location_type: str | None = None
    location_name: str | None = None
    rack_no: str | None = None


class UnknownItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    barcode: str | None = None
    description: str
    counted_qty: float
    photo_base64: str | None = None
    remark: str | None = None
    reported_by: str
    reported_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    item_name: str | None = None
    mrp: float | None = None
    stock: float | None = None
    serial: str | None = None


class UnknownItemCreate(BaseModel):
    session_id: str
    barcode: str | None = None
    description: str
    counted_qty: float | None = 0
    photo_base64: str | None = None
    remark: str | None = None
    item_name: str | None = None
    mrp: float | None = None
    stock: float | None = None
    serial: str | None = None


class PasswordResetRequest(BaseModel):
    """Request for a password reset OTP."""

    username: str | None = None
    phone_number: str | None = None

    @model_validator(mode="after")
    def validate_identifier(self) -> "PasswordResetRequest":
        if not self.username and not self.phone_number:
            raise ValueError("Either username or phone_number must be provided")
        return self


class PasswordResetVerify(BaseModel):
    """Verify OTP and get a reset token."""

    username: str | None = None
    phone_number: str | None = None
    otp: str

    @model_validator(mode="after")
    def validate_identifier(self) -> "PasswordResetVerify":
        if not self.username and not self.phone_number:
            raise ValueError("Either username or phone_number must be provided")
        return self


class CommandState(str, Enum):
    PENDING = "PENDING"
    IN_FLIGHT = "IN_FLIGHT"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    CONFLICT = "CONFLICT"
    REJECTED = "REJECTED"
    BLOCKED_AUTH = "BLOCKED_AUTH"
    BLOCKED_POLICY = "BLOCKED_POLICY"
    MANUAL_REVIEW = "MANUAL_REVIEW"


class CommandType(str, Enum):
    COUNT_OBSERVATION = "COUNT_OBSERVATION"
    BATCH_PROPOSAL = "BATCH_PROPOSAL"
    SERIAL_REGISTRATION = "SERIAL_REGISTRATION"
    CORRECTION = "CORRECTION"
    DAMAGE_REPORT = "DAMAGE_REPORT"
    SESSION_CLAIM = "SESSION_CLAIM"
    HEARTBEAT = "HEARTBEAT"


class CommandJournalEntry(BaseModel):
    command_id: str
    device_id: str
    client_sequence: int
    actor_id: str
    master_session_id: str | None = None
    location_session_id: str | None = None
    item_code: str | None = None
    command_type: CommandType
    payload: dict[str, Any]
    payload_hash: str
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    state: CommandState = CommandState.PENDING
    retry_count: int = 0
    last_error: str | None = None


class CommandSyncRequest(BaseModel):
    device_id: str
    commands: list[CommandJournalEntry]
    client_batch_id: str | None = None


class CommandSyncResponse(BaseModel):
    accepted: list[dict[str, Any]]
    rejected: list[dict[str, Any]]
    acks: dict[str, dict[str, Any]]
    client_batch_id: str | None = None


class CountObservationStatus(str, Enum):
    DRAFT = "DRAFT"
    AWAITING_SQL_VALIDATION = "AWAITING_SQL_VALIDATION"
    AUTO_APPROVED = "AUTO_APPROVED"
    SUPERVISOR_REVIEW = "SUPERVISOR_REVIEW"
    APPROVED = "APPROVED"
    RECOUNT_REQUESTED = "RECOUNT_REQUESTED"
    RECOUNT_ASSIGNED = "RECOUNT_ASSIGNED"
    RECOUNT_IN_PROGRESS = "RECOUNT_IN_PROGRESS"
    RECOUNT_SUBMITTED = "RECOUNT_SUBMITTED"
    RECOUNT_MATCHED = "RECOUNT_MATCHED"
    RECOUNT_DIFFERENCE = "RECOUNT_DIFFERENCE"
    RECOUNT_APPROVED = "RECOUNT_APPROVED"
    REJECTED = "REJECTED"
    DISTRIBUTED_STOCK_INVESTIGATION = "DISTRIBUTED_STOCK_INVESTIGATION"
    PENDING_INVESTIGATION = "PENDING_INVESTIGATION"
    CONFLICT = "CONFLICT"


class SqlComparisonSource(str, Enum):
    ORIGINAL_SUBMISSION = "original_submission"
    RECONSTRUCTED_SUBMISSION = "reconstructed_submission"
    SYNC_TIME = "sync_time"
    RECOUNT_SUBMISSION = "recount_submission"


class SupervisorAction(str, Enum):
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    REQUEST_RECOUNT = "REQUEST_RECOUNT"
    REQUEST_EVIDENCE = "REQUEST_EVIDENCE"
    REQUEST_CLARIFICATION = "REQUEST_CLARIFICATION"
    CORRECT_CLASSIFICATION = "CORRECT_CLASSIFICATION"
    MAP_TO_EXISTING_BATCH = "MAP_TO_EXISTING_BATCH"
    APPROVE_NEW_BATCH = "APPROVE_NEW_BATCH"
    APPROVE_RELOCATION = "APPROVE_RELOCATION"
    APPROVE_BUNDLE = "APPROVE_BUNDLE"
    CREATE_DAMAGE_CASE = "CREATE_DAMAGE_CASE"
    ESCALATE = "ESCALATE"
    ADJUST_COUNT = "ADJUST_COUNT"


class RecountScope(str, Enum):
    ITEM = "ITEM"
    BATCH = "BATCH"
    SERIAL = "SERIAL"
    LOCATION = "LOCATION"
    SESSION = "SESSION"


class RecountPriority(str, Enum):
    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"
    URGENT = "URGENT"


class ReviewQueueType(str, Enum):
    QUANTITY_VARIANCE = "QUANTITY_VARIANCE"
    BATCH_MRP_MISMATCH = "BATCH_MRP_MISMATCH"
    SERIAL_CONFLICT = "SERIAL_CONFLICT"
    LOCATION_INVESTIGATION = "LOCATION_INVESTIGATION"
    DAMAGE_CONDITION = "DAMAGE_CONDITION"
    RETURN_REPAIR = "RETURN_REPAIR"
    UNKNOWN_ITEMS = "UNKNOWN_ITEMS"
    BUNDLE_PROPOSALS = "BUNDLE_PROPOSALS"
    RECOUNT_REQUESTS = "RECOUNT_REQUESTS"
    SYNC_CONFLICTS = "SYNC_CONFLICTS"
    SESSION_FINALISATION = "SESSION_FINALISATION"


class AdditionalLocationResponse(str, Enum):
    YES = "YES"
    NO = "NO"
    NOT_CHECKED = "NOT_CHECKED"


class SystemRecommendation(str, Enum):
    AUTO_APPROVE = "AUTO_APPROVE"
    SUPERVISOR_REVIEW = "SUPERVISOR_REVIEW"
    REQUEST_RECOUNT = "REQUEST_RECOUNT"
    REQUEST_LOCATION_VERIFICATION = "REQUEST_LOCATION_VERIFICATION"
    REQUEST_EVIDENCE = "REQUEST_EVIDENCE"
    PENDING_SQL = "PENDING_SQL"
    BLOCKED = "BLOCKED"


class ApprovalExceptionType(str, Enum):
    BATCH_VARIANCE = "BATCH_VARIANCE"
    SERIAL_CONFLICT = "SERIAL_CONFLICT"
    ATTRIBUTE_MISMATCH = "ATTRIBUTE_MISMATCH"
    LOCATION_MISMATCH = "LOCATION_MISMATCH"
    DAMAGED_STOCK = "DAMAGED_STOCK"
    UNKNOWN_ITEM = "UNKNOWN_ITEM"
    PROVISIONAL_BATCH = "PROVISIONAL_BATCH"
    PROVISIONAL_BUNDLE = "PROVISIONAL_BUNDLE"
    INTERNAL_BARCODE = "INTERNAL_BARCODE"
    INCOMPLETE_EVIDENCE = "INCOMPLETE_EVIDENCE"
    MISSING_POLICY = "MISSING_POLICY"
    LOW_CONFIDENCE = "LOW_CONFIDENCE"
    CONCURRENT_OBSERVATION = "CONCURRENT_OBSERVATION"
    SYNC_CONFLICT = "SYNC_CONFLICT"
    EXCESS_QUANTITY = "EXCESS_QUANTITY"
    SHORTAGE = "SHORTAGE"
    POLICY_THRESHOLD = "POLICY_THRESHOLD"
    RETURN_CLASSIFICATION = "RETURN_CLASSIFICATION"
    COUNT_MODIFIED = "COUNT_MODIFIED"
    RECOUNT_DIFFERENCE = "RECOUNT_DIFFERENCE"


class SqlAvailability(str, Enum):
    AVAILABLE_AT_SUBMISSION = "AVAILABLE_AT_SUBMISSION"
    AVAILABLE_AT_SYNC = "AVAILABLE_AT_SYNC"
    RECONSTRUCTED = "RECONSTRUCTED"
    UNAVAILABLE = "UNAVAILABLE"


class ApprovalExceptionDetail(BaseModel):
    exception_type: ApprovalExceptionType
    description: str | None = None
    is_blocking: bool = True


class CountObservationCreate(BaseModel):
    session_id: str
    item_code: str
    item_name: str | None = None
    counted_qty: float
    base_uom: str | None = None
    uom_code: str | None = None
    uom_name: str | None = None
    conversion_factor: float | None = 1.0
    quantity_precision: int | None = None
    batches: list[dict[str, Any]] | None = None
    serial_entries: list[SerialEntry] | None = None
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
    photo_proofs: list[PhotoProof] | None = None
    parameter_checks: dict[str, Any] | None = None
    accessory_checks: dict[str, Any] | None = None
    variance_reason: str | None = None
    variance_note: str | None = None


class CountObservation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    item_code: str
    item_name: str | None = None
    counted_qty: float
    base_uom: str | None = None
    uom_code: str | None = None
    uom_name: str | None = None
    conversion_factor: float | None = 1.0
    quantity_precision: int | None = None
    batches: list[dict[str, Any]] | None = None
    serial_entries: list[SerialEntry] | None = None
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
    photo_proofs: list[PhotoProof] | None = None
    parameter_checks: dict[str, Any] | None = None
    accessory_checks: dict[str, Any] | None = None
    version: int = 1
    previous_version_id: str | None = None
    status: CountObservationStatus = CountObservationStatus.DRAFT
    approval_status: str | None = None
    sql_qty_at_submission: float | None = None
    sql_qty_at_recount: float | None = None
    sql_quantity_source: SqlAvailability | None = None
    sql_comparison_source: SqlComparisonSource | None = None
    variance: float | None = None
    exception_types: list[ApprovalExceptionType] | None = None
    exception_details: list[ApprovalExceptionDetail] | None = None
    system_recommendation: SystemRecommendation | None = None
    supervisor_decision: str | None = None
    supervisor_notes: str | None = None
    decided_by: str | None = None
    decided_at: datetime | None = None
    additional_location_response: AdditionalLocationResponse | None = None
    linked_location_task_id: str | None = None
    is_recount: bool = False
    recount_of_id: str | None = None
    recount_is_blind: bool = False
    recount_original_hidden_fields: dict[str, Any] | None = None
    idempotency_key: str | None = None
    scan_fingerprint: str | None = None
    created_by: str | None = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )


class RecountRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    observation_id: str
    session_id: str
    item_code: str
    requested_by: str
    request_reason: str
    scope: RecountScope = RecountScope.ITEM
    batch_or_serial_scope: str | None = None
    location_id: str | None = None
    required_evidence: list[str] | None = None
    priority: RecountPriority = RecountPriority.NORMAL
    is_blind: bool = True
    status: CountObservationStatus = CountObservationStatus.RECOUNT_REQUESTED
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
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    observation_id: str
    session_id: str
    item_code: str
    response: AdditionalLocationResponse
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
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    observation_id: str | None = None
    recount_request_id: str | None = None
    session_id: str | None = None
    decided_by: str
    decided_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    action: SupervisorAction
    reason: str | None = None
    notes: str | None = None
    corrected_classification: str | None = None
    target_batch_id: str | None = None
    damage_case_id: str | None = None
    linked_verification_task_id: str | None = None
    observation_snapshot: dict[str, Any] | None = None


class SupervisorReviewCard(BaseModel):
    observation_id: str
    session_id: str
    queue_type: ReviewQueueType
    staff_user: str
    staff_name: str | None = None
    location: str | None = None
    item_identity: dict[str, Any]
    tracking_mode: str | None = None
    baseline_qty: float | None = None
    sql_qty_at_submission: float | None = None
    physical_qty: float
    variance: float | None = None
    batch_details: list[dict[str, Any]] | None = None
    serial_details: list[dict[str, Any]] | None = None
    split_count_calculation: dict[str, Any] | None = None
    mandatory_remark: str | None = None
    additional_location_response: str | None = None
    parameter_differences: list[dict[str, Any]] | None = None
    photos: list[str] | None = None
    previous_count_versions: list[dict[str, Any]] | None = None
    system_recommendation: SystemRecommendation
    exception_types: list[ApprovalExceptionType] | None = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )


class SessionApprovalSummary(BaseModel):
    session_id: str
    total_observations: int
    auto_approved: int
    supervisor_approved: int
    recount_requested: int
    pending_investigation: int
    sync_conflicts: int
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
    rules_passed: list[AutoApprovalRuleResult]
    sql_quantity_source: SqlAvailability | None
    sql_comparison_source: SqlComparisonSource | None
    block_reason: str | None = None


class PasswordResetConfirm(BaseModel):
    """Confirm password reset using the token."""

    reset_token: str
    new_password: str
    confirm_password: str

    @model_validator(mode="after")
    def validate_passwords(self) -> "PasswordResetConfirm":
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match")
        if len(self.new_password) < 8:
            raise ValueError("Password must be at least 8 characters long")
        return self


class QuantityObservation(BaseModel):
    quantity: float
    remark: str | None = None
    observed_at: datetime | None = None
    observed_by: str | None = None


class PhysicalBatch(BaseModel):
    item_code: str
    physical_batch_number: str
    mrp: float | None = None
    mfg_date: str | None = None
    expiry_date: str | None = None
    qty: float
    condition: str | None = None


class SerialUnit(BaseModel):
    serial_number: str
    item_code: str
    mrp: float | None = None
    mfg_date: str | None = None
    expiry_date: str | None = None
    condition: str | None = None
    damage_type: str | None = None
    photos: list[str] = Field(default_factory=list)
    location: str | None = None


class ConditionAllocation(BaseModel):
    condition: str
    qty: float
    reason: str | None = None


class EvidenceRecord(BaseModel):
    storage_key: str
    filename: str
    capture_time: datetime | None = None
    uploader: str | None = None
    file_hash: str | None = None
    upload_status: str = "pending"


class ExceptionRecord(BaseModel):
    type: str
    description: str
    severity: str = "medium"


class StructuredCountObservation(BaseModel):
    """Structured count-observation model (L09): composes quantity, batches,
    serials, condition allocations, evidence and exception sub-documents with
    append-only versioning. Renamed on merge to avoid colliding with the
    legacy flat CountObservation above; both are currently unreferenced."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    item_code: str
    item_name: str | None = None
    quantity_observation: QuantityObservation
    physical_batch: list[PhysicalBatch] = Field(default_factory=list)
    serial_unit: list[SerialUnit] = Field(default_factory=list)
    condition_allocation: list[ConditionAllocation] = Field(default_factory=list)
    evidence: list[EvidenceRecord] = Field(default_factory=list)
    exception: list[ExceptionRecord] = Field(default_factory=list)
    idempotency_key: str | None = None
    version: int = 1
    previous_version_id: str | None = None
    parent_observation_id: str | None = None
    lineage: list[str] = Field(default_factory=list)
    status: str = "draft"
    submitted_at: datetime | None = None
    submitted_by: str | None = None
    floor_id: str | None = None
    rack_id: str | None = None
    floor_no: str | None = None
    rack_no: str | None = None
    barcode: str | None = None
    batches: list[dict[str, Any]] | None = None
    remark: str | None = None
    noted_qty: float | None = None
    variance_reason: str | None = None
    variance_note: str | None = None

    @model_validator(mode="after")
    def normalize_location_context(self) -> "StructuredCountObservation":
        if self.floor_id:
            self.floor_id = str(self.floor_id).strip() or None
        if self.rack_id:
            self.rack_id = str(self.rack_id).strip() or None
        if self.floor_no:
            self.floor_no = str(self.floor_no).strip() or None
        if self.rack_no:
            self.rack_no = str(self.rack_no).strip() or None
        if not self.floor_id and self.floor_no:
            self.floor_id = self.floor_no
        if not self.rack_id and self.rack_no:
            self.rack_id = self.rack_no
        return self


class DamageType(str, Enum):
    PHYSICAL = "PHYSICAL"
    WATER = "WATER"
    FIRE = "FIRE"
    MOLD = "MOLD"
    EXPIRED = "EXPIRED"
    BATTERY_LEAK = "BATTERY_LEAK"
    PACKAGING = "PACKAGING"
    OTHER = "OTHER"


class ItemCondition(str, Enum):
    SALEABLE = "SALEABLE"
    DAMAGED = "DAMAGED"
    EXPIRED = "EXPIRED"
    QUARANTINE = "QUARANTINE"
    OPENED_BOX = "OPENED_BOX"
    DISPLAY = "DISPLAY"
    INCOMPLETE = "INCOMPLETE"
    RETURNABLE = "RETURNABLE"
    NON_RETURNABLE = "NON_RETURNABLE"
    REPAIRABLE = "REPAIRABLE"
    INSPECTION_REQUIRED = "INSPECTION_REQUIRED"


class ReturnStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    PICKUP_SCHEDULED = "PICKUP_SCHEDULED"
    PICKED_UP = "PICKED_UP"
    CREDIT_NOTE_ISSUED = "CREDIT_NOTE_ISSUED"
    REPAIR_IN_PROGRESS = "REPAIR_IN_PROGRESS"
    REPAIRED = "REPAIRED"
    DISCOUNT_SALE = "DISCOUNT_SALE"
    WRITE_OFF = "WRITE_OFF"


class DamageCase(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    observation_id: str | None = None
    count_line_id: str | None = None
    session_id: str
    item_code: str
    item_name: str | None = None
    batch_id: str | None = None
    serial_numbers: list[str] | None = None
    qty: float
    damage_type: DamageType = DamageType.PHYSICAL
    condition: ItemCondition = ItemCondition.DAMAGED
    return_status: ReturnStatus = ReturnStatus.PENDING
    reason: str | None = None
    condition_details: str | None = None
    photo_urls: list[str] | None = None
    reported_by: str
    decided_by: str | None = None
    decided_at: datetime | None = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )


class DamageCaseCreate(BaseModel):
    observation_id: str | None = None
    count_line_id: str | None = None
    session_id: str
    item_code: str
    item_name: str | None = None
    batch_id: str | None = None
    serial_numbers: list[str] | None = None
    qty: float
    damage_type: DamageType = DamageType.PHYSICAL
    condition: ItemCondition = ItemCondition.DAMAGED
    reason: str | None = None
    condition_details: str | None = None
    photo_urls: list[str] | None = None


class DamageCaseDecision(BaseModel):
    damage_case_id: str
    action: str
    return_status: ReturnStatus | None = None
    reason: str | None = None
    credit_note_amount: float | None = None
    repair_notes: str | None = None
    decided_by: str
