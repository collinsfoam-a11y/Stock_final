"""
Variance Service - Handles variance calculation and threshold checking

This service calculates variances between counted and expected quantities/values
and checks them against configurable thresholds to determine if supervisor
approval is required.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


class VarianceService:
    """Service for variance calculation and threshold checking"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def calculate_variance(
        self,
        item_code: str,
        counted_qty: float,
        expected_qty: float,
        unit_price: float,
        valuation_basis: str = "last_cost",
    ) -> Dict:
        """
        Calculate variance metrics for a count line.

        Args:
            item_code: Item code being counted
            counted_qty: Quantity counted by user
            expected_qty: Expected quantity from ERP
            unit_price: Price per unit (last_cost or sale_price)
            valuation_basis: Basis for valuation ("last_cost" or "sale_price")

        Returns:
            Dictionary with variance metrics:
            {
                "quantity_variance": float,
                "value_variance": float,
                "percentage_variance": float,
                "expected_qty": float,
                "counted_qty": float,
                "unit_price": float,
                "expected_value": float,
                "counted_value": float,
                "valuation_basis": str,
            }
        """
        quantity_variance = counted_qty - expected_qty
        expected_value = expected_qty * unit_price
        counted_value = counted_qty * unit_price
        value_variance = counted_value - expected_value

        percentage_variance = 0.0
        if expected_qty != 0:
            percentage_variance = (quantity_variance / expected_qty) * 100

        return {
            "quantity_variance": round(quantity_variance, 2),
            "value_variance": round(value_variance, 2),
            "percentage_variance": round(percentage_variance, 2),
            "expected_qty": expected_qty,
            "counted_qty": counted_qty,
            "unit_price": unit_price,
            "expected_value": round(expected_value, 2),
            "counted_value": round(counted_value, 2),
            "valuation_basis": valuation_basis,
        }

    async def check_thresholds(
        self,
        variance_data: Dict,
        item_category: Optional[str] = None,
        location: Optional[str] = None,
    ) -> Tuple[bool, List[Dict]]:
        """
        Check if variance exceeds configured thresholds.

        Args:
            variance_data: Output from calculate_variance()
            item_category: Category of the item (for category-specific thresholds)
            location: Location where count was performed

        Returns:
            Tuple of (requires_approval, violated_thresholds)
            - requires_approval: bool indicating if supervisor approval is needed
            - violated_thresholds: List of threshold violations with details
        """
        # Get applicable threshold config
        config = await self._get_applicable_config(item_category, location)
        if not config:
            logger.warning("No threshold configuration found, using defaults")
            config = await self._get_default_config()

        violated_thresholds = []
        requires_approval = False

        for threshold in config.get("thresholds", []):
            if not threshold.get("enabled", True):
                continue

            threshold_type = threshold["threshold_type"]
            operator = threshold["operator"]
            threshold_value = threshold["value"]

            # Get the actual variance value to compare
            if threshold_type == "quantity":
                actual_value = abs(variance_data["quantity_variance"])
            elif threshold_type == "value":
                actual_value = abs(variance_data["value_variance"])
            elif threshold_type == "percentage":
                actual_value = abs(variance_data["percentage_variance"])
            else:
                logger.warning(f"Unknown threshold type: {threshold_type}")
                continue

            # Check threshold
            is_violated = False
            if operator == "gte" and actual_value >= threshold_value:
                is_violated = True
            elif operator == "lte" and actual_value <= threshold_value:
                is_violated = True
            elif operator == "eq" and actual_value == threshold_value:
                is_violated = True

            if is_violated:
                violated_thresholds.append(
                    {
                        "threshold_type": threshold_type,
                        "threshold_value": threshold_value,
                        "actual_value": actual_value,
                        "operator": operator,
                        "require_supervisor": threshold.get("require_supervisor", True),
                        "require_reason": threshold.get("require_reason", False),
                        "currency": threshold.get("currency", "INR"),
                    }
                )

                if threshold.get("require_supervisor", True):
                    requires_approval = True

        logger.info(
            f"Threshold check complete: requires_approval={requires_approval}, "
            f"violations={len(violated_thresholds)}"
        )

        return requires_approval, violated_thresholds

    async def _get_applicable_config(
        self, category: Optional[str], location: Optional[str]
    ) -> Optional[Dict]:
        """
        Get the most specific threshold config that applies.

        Priority: category+location > category > location > default
        """
        # Try category + location specific
        if category and location:
            config = await self.db.variance_threshold_configs.find_one(
                {
                    "apply_to_categories": category,
                    "apply_to_locations": location,
                }
            )
            if config:
                logger.info(f"Using category+location specific config for {category}/{location}")
                return config

        # Try category specific
        if category:
            config = await self.db.variance_threshold_configs.find_one(
                {
                    "apply_to_categories": category,
                    "apply_to_locations": None,
                }
            )
            if config:
                logger.info(f"Using category specific config for {category}")
                return config

        # Try location specific
        if location:
            config = await self.db.variance_threshold_configs.find_one(
                {
                    "apply_to_categories": None,
                    "apply_to_locations": location,
                }
            )
            if config:
                logger.info(f"Using location specific config for {location}")
                return config

        # Default config
        config = await self.db.variance_threshold_configs.find_one(
            {"name": "Default Variance Thresholds"}
        )
        if config:
            logger.info("Using default threshold config")
        return config

    async def _get_default_config(self) -> Dict:
        """Get or create default threshold configuration"""
        config = await self.db.variance_threshold_configs.find_one(
            {"name": "Default Variance Thresholds"}
        )

        if not config:
            # Create default config
            default_config = {
                "name": "Default Variance Thresholds",
                "description": "Standard thresholds for all items",
                "thresholds": [
                    {
                        "threshold_type": "quantity",
                        "operator": "gte",
                        "value": 1.0,
                        "require_supervisor": True,
                        "require_reason": False,
                        "enabled": True,
                    },
                    {
                        "threshold_type": "value",
                        "operator": "gte",
                        "value": 500.0,
                        "currency": "INR",
                        "require_supervisor": True,
                        "require_reason": True,
                        "enabled": True,
                    },
                ],
                "apply_to_categories": None,
                "apply_to_locations": None,
                "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
            }

            result = await self.db.variance_threshold_configs.insert_one(default_config)
            default_config["_id"] = result.inserted_id
            logger.info("Created default variance threshold configuration")
            return default_config

        return config
