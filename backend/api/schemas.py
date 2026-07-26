import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, Field, field_validator, model_validator

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


class CountLineCreate(BaseModel):
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
    notes: str | None = None
    # See CountLineApprovalRequest: required to approve lines whose ERP item
    # was re-synced after counting (stale variance baseline).
    acknowledge_stale_master_data: bool = False


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
    status: str = "OPEN"  # OPEN, ACTIVE, CLOSED
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
            # Map legacy RECONCILE to ACTIVE for now, or allow it if we can't
            # migrate yet. But the plan says "Normalize session states
            # (OPEN | ACTIVE | CLOSED)".
            # If we strictly enforce it, we might break existing data.
            # Let's allow RECONCILE but prefer ACTIVE.
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
