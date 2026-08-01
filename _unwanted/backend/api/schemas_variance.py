# Variance Threshold Models
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


class VarianceThreshold(BaseModel):
    """Individual variance threshold configuration"""

    threshold_type: str = Field(..., description="Type: 'quantity', 'value', or 'percentage'")
    operator: str = Field(..., description="Comparison operator: 'gte', 'lte', or 'eq'")
    value: float = Field(..., description="Threshold value")
    currency: str = Field(default="INR", description="Currency for value thresholds")
    require_supervisor: bool = Field(
        default=True, description="Require supervisor approval if exceeded"
    )
    require_reason: bool = Field(default=False, description="Require variance reason if exceeded")
    enabled: bool = Field(default=True, description="Whether this threshold is active")


class VarianceThresholdConfig(BaseModel):
    """Complete variance threshold configuration"""

    name: str = Field(..., description="Configuration name")
    description: str = Field(..., description="Configuration description")
    thresholds: list[VarianceThreshold] = Field(default_factory=list)
    apply_to_categories: Optional[list[str]] = Field(
        default=None, description="Categories this applies to (None = all)"
    )
    apply_to_locations: Optional[list[str]] = Field(
        default=None, description="Locations this applies to (None = all)"
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )


class VarianceData(BaseModel):
    """Variance calculation result"""

    quantity_variance: float
    value_variance: float
    percentage_variance: float
    expected_qty: float
    counted_qty: float
    unit_price: float
    expected_value: float
    counted_value: float
    valuation_basis: str = "last_cost"


class ViolatedThreshold(BaseModel):
    """Details of a violated threshold"""

    threshold_type: str
    threshold_value: float
    actual_value: float
    operator: str
    require_supervisor: bool
    require_reason: bool
    currency: str = "INR"


class CountLineSubmission(BaseModel):
    """Data for submitting a count line"""

    variance_reason: Optional[str] = Field(
        default=None, description="Reason for variance (required if threshold exceeded)"
    )
