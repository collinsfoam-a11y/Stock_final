import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Generic, Literal, Optional, TypeVar, Union

from pydantic import BaseModel, Field, field_validator, model_validator

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    success: bool
    data: Optional[T] = None
    error: Union[dict[str, Any], None] = Field(default=None)
    message: Optional[str] = None
    payload_version: str = "1.0"

    model_config = {
        "json_schema_extra": {"examples": []},
        # Exclude None values from serialization to avoid validation issues
    }

    @classmethod
    def success_response(cls, data: T, message: Optional[str] = None):
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
    category: Optional[str] = None
    subcategory: Optional[str] = None
    warehouse: Optional[str] = None
    location: Optional[str] = None
    uom_code: Optional[str] = None
    uom_name: Optional[str] = None
    hsn_code: Optional[str] = None
    gst_category: Optional[str] = None
    gst_percent: Optional[float] = None
    sgst_percent: Optional[float] = None
    cgst_percent: Optional[float] = None
    igst_percent: Optional[float] = None
    floor: Optional[str] = None
    rack: Optional[str] = None
    verified: Optional[bool] = False
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None
    last_scanned_at: Optional[datetime] = None
    verified_qty: Optional[float] = None
    variance: Optional[float] = None
    damaged_qty: Optional[float] = None
    non_returnable_damaged_qty: Optional[float] = None
    item_condition: Optional[str] = None
    manual_barcode: Optional[str] = None
    serial_number: Optional[str] = None
    is_serialized: Optional[bool] = None
    verified_floor: Optional[str] = None
    verified_rack: Optional[str] = None
    image_url: Optional[str] = None
    # Sales / pricing metadata
    sales_price: Optional[float] = None
    sale_price: Optional[float] = None
    standard_rate: Optional[float] = None
    last_purchase_rate: Optional[float] = None
    last_purchase_price: Optional[float] = None
    # Brand metadata
    brand_id: Optional[str] = None
    brand_name: Optional[str] = None
    brand_code: Optional[str] = None
    # Supplier metadata
    supplier_id: Optional[str] = None
    supplier_code: Optional[str] = None
    supplier_name: Optional[str] = None
    last_purchase_supplier: Optional[str] = None
    supplier_phone: Optional[str] = None
    supplier_city: Optional[str] = None
    supplier_state: Optional[str] = None
    supplier_gst: Optional[str] = None
    # Purchase info
    purchase_price: Optional[float] = None
    last_purchase_qty: Optional[float] = None
    purchase_qty: Optional[float] = None
    purchase_invoice_no: Optional[str] = None
    purchase_reference: Optional[str] = None
    last_purchase_date: Optional[datetime] = None
    last_purchase_cost: Optional[float] = None
    purchase_voucher_type: Optional[str] = None
    purchase_type: Optional[str] = None
    batch_id: Optional[Union[int, str]] = None
    batch_no: Optional[str] = None
    manufacturing_date: Optional[str] = None
    expiry_date: Optional[str] = None

    # SQL Verification fields
    sql_verified_qty: Optional[float] = None
    last_sql_verified_at: Optional[datetime] = None
    mongo_cached_qty_previous: Optional[float] = None
    sql_qty_mismatch_flag: Optional[bool] = None
    sql_verification_status: Optional[str] = None


class UserInfo(BaseModel):
    id: str
    username: str
    full_name: str
    role: str
    email: Optional[str] = None
    employee_id: Optional[str] = None
    phone: Optional[str] = None
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
    employee_id: Optional[str] = None
    phone: Optional[str] = None


class UserLogin(BaseModel):
    username: str
    password: str


class PinLogin(BaseModel):
    """PIN-based login for staff users (4-digit numeric PIN)."""

    pin: str
    username: Optional[str] = None


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
    notes: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None


class DateFormatType(str, Enum):
    """Date format type for manufacturing and expiry dates"""

    FULL = "full"  # DD/MM/YYYY
    MONTH_YEAR = "month_year"  # MM/YYYY
    YEAR_ONLY = "year_only"  # YYYY
    NONE = "none"  # No date


class SerialEntry(BaseModel):
    """Enhanced serial entry with per-serial attributes"""

    serial_number: str
    mrp: Optional[float] = None
    manufacturing_date: Optional[str] = None
    mfg_date_format: Optional[DateFormatType] = None
    expiry_date: Optional[str] = None
    expiry_date_format: Optional[DateFormatType] = None


class RelocationStatus(str, Enum):
    PENDING = "PENDING"
    MOVED = "MOVED"
    IGNORED = "IGNORED"


class CountLineCreate(BaseModel):
    session_id: str
    location_id: Optional[str] = None
    floor_id: Optional[str] = None
    rack_id: Optional[str] = None
    item_code: str
    item_name: Optional[str] = None
    idempotency_key: Optional[str] = None
    recount_of_id: Optional[str] = None
    barcode: Optional[str] = None
    batch_id: Optional[str] = None
    batches: Optional[list[dict[str, Any]]] = None
    variant_id: Optional[str] = None
    variant_barcode: Optional[str] = None
    mrp_source: Optional[str] = None
    condition_details: Optional[str] = None
    counted_qty: float
    input_qty: Optional[float] = None
    input_uom: Optional[str] = None
    base_uom: Optional[str] = None
    uom_code: Optional[str] = None
    uom_name: Optional[str] = None
    conversion_factor: Optional[float] = 1.0
    quantity_precision: Optional[int] = None
    damaged_qty: Optional[float] = 0
    non_returnable_damaged_qty: Optional[float] = 0
    damage_included: Optional[bool] = None
    item_condition: Optional[str] = None
    floor_no: Optional[str] = None
    rack_no: Optional[str] = None
    mark_location: Optional[str] = None
    sr_no: Optional[str] = None
    manufacturing_date: Optional[str] = None
    mfg_date_format: Optional[DateFormatType] = None
    expiry_date: Optional[str] = None
    expiry_date_format: Optional[DateFormatType] = None
    variance_reason: Optional[str] = None
    variance_note: Optional[str] = None
    remark: Optional[str] = None
    photo_base64: Optional[str] = None
    mrp_counted: Optional[float] = None
    split_section: Optional[str] = None
    serial_numbers: Optional[list[str]] = None
    serial_entries: Optional[list[SerialEntry]] = None
    correction_reason: Optional[CorrectionReason] = None
    photo_proofs: Optional[list[PhotoProof]] = None
    correction_metadata: Optional[CorrectionMetadata] = None
    category_correction: Optional[str] = None
    subcategory_correction: Optional[str] = None

    # Misplaced Stock Fields
    is_misplaced: Optional[bool] = False
    expected_location: Optional[str] = None
    found_location: Optional[str] = None
    relocation_status: Optional[RelocationStatus] = None

    # Lineage / Conflict Governance Fields
    version: int = 1
    previous_version_id: Optional[str] = None

    @model_validator(mode="after")
    def normalize_location_context(self) -> "CountLineCreate":
        """Keep backward compatibility while preferring canonical location IDs."""
        if self.location_id:
            self.location_id = str(self.location_id).strip() or None
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


class BulkCountLineUpdate(BaseModel):
    count_line_ids: list[str]
    notes: Optional[str] = None


class Session(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    warehouse: str
    location_id: Optional[str] = None
    location_key: Optional[str] = None
    location_type: Optional[str] = None
    location_name: Optional[str] = None
    rack_no: Optional[str] = None
    staff_user: str
    staff_name: str
    status: str = "OPEN"  # OPEN, ACTIVE, CLOSED, PAUSED, SUBMITTED, SUPERVISOR_REVIEW, RECOUNT_REQUIRED, APPROVED, COMPLETED, FINALISED, CANCELLED, AUTO_RELEASED
    approval_status: Optional[str] = None
    auto_release_reason: Optional[str] = None
    approval_summary: Optional[dict] = None
    blocking_items: Optional[list[str]] = None
    type: str = "STANDARD"  # STANDARD, BLIND, STRICT
    started_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    last_heartbeat: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    reconciled_at: Optional[datetime] = None
    finalized_at: Optional[datetime] = None
    finalized_by: Optional[str] = None
    finalization_status: Optional[str] = None
    total_items: int = 0
    total_variance: float = 0
    verified_items: int = 0
    pending_items: int = 0
    damage_items: int = 0
    notes: Optional[str] = None
    barcode: Optional[str] = None

    # Governance Fields
    config_version_id: Optional[str] = None
    snapshot_hash: Optional[str] = None
    # Reference to external storage if too large
    snapshot_items_ref: Optional[str] = None

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
    type: Optional[str] = "STANDARD"
    location_type: Optional[str] = None
    location_name: Optional[str] = None
    rack_no: Optional[str] = None


class UnknownItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    barcode: Optional[str] = None
    description: str
    counted_qty: float
    photo_base64: Optional[str] = None
    remark: Optional[str] = None
    reported_by: str
    reported_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    item_name: Optional[str] = None
    mrp: Optional[float] = None
    stock: Optional[float] = None
    serial: Optional[str] = None


class UnknownItemCreate(BaseModel):
    session_id: str
    barcode: Optional[str] = None
    description: str
    counted_qty: Optional[float] = 0
    photo_base64: Optional[str] = None
    remark: Optional[str] = None
    item_name: Optional[str] = None
    mrp: Optional[float] = None
    stock: Optional[float] = None
    serial: Optional[str] = None


class PasswordResetRequest(BaseModel):
    """Request for a password reset OTP."""

    username: Optional[str] = None
    phone_number: Optional[str] = None

    @model_validator(mode="after")
    def validate_identifier(self) -> "PasswordResetRequest":
        if not self.username and not self.phone_number:
            raise ValueError("Either username or phone_number must be provided")
        return self


class PasswordResetVerify(BaseModel):
    """Verify OTP and get a reset token."""

    username: Optional[str] = None
    phone_number: Optional[str] = None
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
    master_session_id: Optional[str] = None
    location_session_id: Optional[str] = None
    item_code: Optional[str] = None
    command_type: CommandType
    payload: dict[str, Any]
    payload_hash: str
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    state: CommandState = CommandState.PENDING
    retry_count: int = 0
    last_error: Optional[str] = None


class CommandSyncRequest(BaseModel):
    device_id: str
    commands: list[CommandJournalEntry]
    client_batch_id: Optional[str] = None


class CommandSyncResponse(BaseModel):
    accepted: list[dict[str, Any]]
    rejected: list[dict[str, Any]]
    acks: dict[str, dict[str, Any]]
    client_batch_id: Optional[str] = None
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
    description: Optional[str] = None
    is_blocking: bool = True


class CountObservationCreate(BaseModel):
    session_id: str
    item_code: str
    item_name: Optional[str] = None
    counted_qty: float
    base_uom: Optional[str] = None
    uom_code: Optional[str] = None
    uom_name: Optional[str] = None
    conversion_factor: Optional[float] = 1.0
    quantity_precision: Optional[int] = None
    batches: Optional[list[dict[str, Any]]] = None
    serial_entries: Optional[list[SerialEntry]] = None
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
    photo_proofs: Optional[list[PhotoProof]] = None
    parameter_checks: Optional[dict[str, Any]] = None
    accessory_checks: Optional[dict[str, Any]] = None
    variance_reason: Optional[str] = None
    variance_note: Optional[str] = None


class CountObservation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    item_code: str
    item_name: Optional[str] = None
    counted_qty: float
    base_uom: Optional[str] = None
    uom_code: Optional[str] = None
    uom_name: Optional[str] = None
    conversion_factor: Optional[float] = 1.0
    quantity_precision: Optional[int] = None
    batches: Optional[list[dict[str, Any]]] = None
    serial_entries: Optional[list[SerialEntry]] = None
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
    photo_proofs: Optional[list[PhotoProof]] = None
    parameter_checks: Optional[dict[str, Any]] = None
    accessory_checks: Optional[dict[str, Any]] = None
    version: int = 1
    previous_version_id: Optional[str] = None
    status: CountObservationStatus = CountObservationStatus.DRAFT
    approval_status: Optional[str] = None
    sql_qty_at_submission: Optional[float] = None
    sql_qty_at_recount: Optional[float] = None
    sql_quantity_source: Optional[SqlAvailability] = None
    sql_comparison_source: Optional[SqlComparisonSource] = None
    variance: Optional[float] = None
    exception_types: Optional[list[ApprovalExceptionType]] = None
    exception_details: Optional[list[ApprovalExceptionDetail]] = None
    system_recommendation: Optional[SystemRecommendation] = None
    supervisor_decision: Optional[str] = None
    supervisor_notes: Optional[str] = None
    decided_by: Optional[str] = None
    decided_at: Optional[datetime] = None
    additional_location_response: Optional[AdditionalLocationResponse] = None
    linked_location_task_id: Optional[str] = None
    is_recount: bool = False
    recount_of_id: Optional[str] = None
    recount_is_blind: bool = False
    recount_original_hidden_fields: Optional[dict[str, Any]] = None
    idempotency_key: Optional[str] = None
    scan_fingerprint: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class RecountRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    observation_id: str
    session_id: str
    item_code: str
    requested_by: str
    request_reason: str
    scope: RecountScope = RecountScope.ITEM
    batch_or_serial_scope: Optional[str] = None
    location_id: Optional[str] = None
    required_evidence: Optional[list[str]] = None
    priority: RecountPriority = RecountPriority.NORMAL
    is_blind: bool = True
    status: CountObservationStatus = CountObservationStatus.RECOUNT_REQUESTED
    assigned_to: Optional[str] = None
    assigned_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    linked_recount_observation_id: Optional[str] = None


class AdditionalLocationInvestigation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    observation_id: str
    session_id: str
    item_code: str
    response: AdditionalLocationResponse
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
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    observation_id: Optional[str] = None
    recount_request_id: Optional[str] = None
    session_id: Optional[str] = None
    decided_by: str
    decided_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    action: SupervisorAction
    reason: Optional[str] = None
    notes: Optional[str] = None
    corrected_classification: Optional[str] = None
    target_batch_id: Optional[str] = None
    damage_case_id: Optional[str] = None
    linked_verification_task_id: Optional[str] = None
    observation_snapshot: Optional[dict[str, Any]] = None


class SupervisorReviewCard(BaseModel):
    observation_id: str
    session_id: str
    queue_type: ReviewQueueType
    staff_user: str
    staff_name: Optional[str] = None
    location: Optional[str] = None
    item_identity: dict[str, Any]
    tracking_mode: Optional[str] = None
    baseline_qty: Optional[float] = None
    sql_qty_at_submission: Optional[float] = None
    physical_qty: float
    variance: Optional[float] = None
    batch_details: Optional[list[dict[str, Any]]] = None
    serial_details: Optional[list[dict[str, Any]]] = None
    split_count_calculation: Optional[dict[str, Any]] = None
    mandatory_remark: Optional[str] = None
    additional_location_response: Optional[str] = None
    parameter_differences: Optional[list[dict[str, Any]]] = None
    photos: Optional[list[str]] = None
    previous_count_versions: Optional[list[dict[str, Any]]] = None
    system_recommendation: SystemRecommendation
    exception_types: Optional[list[ApprovalExceptionType]] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class SessionApprovalSummary(BaseModel):
    session_id: str
    total_observations: int
    auto_approved: int
    supervisor_approved: int
    recount_requested: int
    pending_investigation: int
    sync_conflicts: int
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
    rules_passed: list[AutoApprovalRuleResult]
    sql_quantity_source: Optional[SqlAvailability]
    sql_comparison_source: Optional[SqlComparisonSource]
    block_reason: Optional[str] = None

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
    remark: Optional[str] = None
    observed_at: Optional[datetime] = None
    observed_by: Optional[str] = None


class PhysicalBatch(BaseModel):
    item_code: str
    physical_batch_number: str
    mrp: Optional[float] = None
    mfg_date: Optional[str] = None
    expiry_date: Optional[str] = None
    qty: float
    condition: Optional[str] = None


class SerialUnit(BaseModel):
    serial_number: str
    item_code: str
    mrp: Optional[float] = None
    mfg_date: Optional[str] = None
    expiry_date: Optional[str] = None
    condition: Optional[str] = None
    damage_type: Optional[str] = None
    photos: list[str] = Field(default_factory=list)
    location: Optional[str] = None


class ConditionAllocation(BaseModel):
    condition: str
    qty: float
    reason: Optional[str] = None


class EvidenceRecord(BaseModel):
    storage_key: str
    filename: str
    capture_time: Optional[datetime] = None
    uploader: Optional[str] = None
    file_hash: Optional[str] = None
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
    item_name: Optional[str] = None
    quantity_observation: QuantityObservation
    physical_batch: list[PhysicalBatch] = Field(default_factory=list)
    serial_unit: list[SerialUnit] = Field(default_factory=list)
    condition_allocation: list[ConditionAllocation] = Field(default_factory=list)
    evidence: list[EvidenceRecord] = Field(default_factory=list)
    exception: list[ExceptionRecord] = Field(default_factory=list)
    idempotency_key: Optional[str] = None
    version: int = 1
    previous_version_id: Optional[str] = None
    parent_observation_id: Optional[str] = None
    lineage: list[str] = Field(default_factory=list)
    status: str = "draft"
    submitted_at: Optional[datetime] = None
    submitted_by: Optional[str] = None
    floor_id: Optional[str] = None
    rack_id: Optional[str] = None
    floor_no: Optional[str] = None
    rack_no: Optional[str] = None
    barcode: Optional[str] = None
    batches: Optional[list[dict[str, Any]]] = None
    remark: Optional[str] = None
    noted_qty: Optional[float] = None
    variance_reason: Optional[str] = None
    variance_note: Optional[str] = None

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
    observation_id: Optional[str] = None
    count_line_id: Optional[str] = None
    session_id: str
    item_code: str
    item_name: Optional[str] = None
    batch_id: Optional[str] = None
    serial_numbers: Optional[list[str]] = None
    qty: float
    damage_type: DamageType = DamageType.PHYSICAL
    condition: ItemCondition = ItemCondition.DAMAGED
    return_status: ReturnStatus = ReturnStatus.PENDING
    reason: Optional[str] = None
    condition_details: Optional[str] = None
    photo_urls: Optional[list[str]] = None
    reported_by: str
    decided_by: Optional[str] = None
    decided_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class DamageCaseCreate(BaseModel):
    observation_id: Optional[str] = None
    count_line_id: Optional[str] = None
    session_id: str
    item_code: str
    item_name: Optional[str] = None
    batch_id: Optional[str] = None
    serial_numbers: Optional[list[str]] = None
    qty: float
    damage_type: DamageType = DamageType.PHYSICAL
    condition: ItemCondition = ItemCondition.DAMAGED
    reason: Optional[str] = None
    condition_details: Optional[str] = None
    photo_urls: Optional[list[str]] = None


class DamageCaseDecision(BaseModel):
    damage_case_id: str
    action: str
    return_status: Optional[ReturnStatus] = None
    reason: Optional[str] = None
    credit_note_amount: Optional[float] = None
    repair_notes: Optional[str] = None
    decided_by: str