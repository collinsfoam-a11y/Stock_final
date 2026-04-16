"""
Unit tests for VarianceService
"""

import pytest
from backend.services.variance_service import VarianceService


class MockDB:
    """Mock database for testing"""

    def __init__(self):
        self.variance_threshold_configs = MockCollection()


class MockCollection:
    """Mock MongoDB collection"""

    def __init__(self):
        self.data = []

    async def find_one(self, query):
        """Mock find_one"""
        # Return default config
        if query.get("name") == "Default Variance Thresholds":
            return {
                "_id": "default",
                "name": "Default Variance Thresholds",
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
            }
        return None

    async def insert_one(self, doc):
        """Mock insert_one"""
        self.data.append(doc)
        return type("obj", (object,), {"inserted_id": "test_id"})


@pytest.mark.asyncio
async def test_calculate_variance_positive():
    """Test variance calculation with positive variance"""
    db = MockDB()
    service = VarianceService(db)

    result = await service.calculate_variance(
        item_code="ITEM001",
        counted_qty=105,
        expected_qty=100,
        unit_price=50,
        valuation_basis="last_cost",
    )

    assert result["quantity_variance"] == 5.0
    assert result["value_variance"] == 250.0  # 5 * 50
    assert result["percentage_variance"] == 5.0  # (5/100) * 100
    assert result["expected_qty"] == 100
    assert result["counted_qty"] == 105
    assert result["unit_price"] == 50
    assert result["expected_value"] == 5000.0  # 100 * 50
    assert result["counted_value"] == 5250.0  # 105 * 50


@pytest.mark.asyncio
async def test_calculate_variance_negative():
    """Test variance calculation with negative variance"""
    db = MockDB()
    service = VarianceService(db)

    result = await service.calculate_variance(
        item_code="ITEM002", counted_qty=95, expected_qty=100, unit_price=50
    )

    assert result["quantity_variance"] == -5.0
    assert result["value_variance"] == -250.0
    assert result["percentage_variance"] == -5.0


@pytest.mark.asyncio
async def test_calculate_variance_zero():
    """Test variance calculation with zero variance"""
    db = MockDB()
    service = VarianceService(db)

    result = await service.calculate_variance(
        item_code="ITEM003", counted_qty=100, expected_qty=100, unit_price=50
    )

    assert result["quantity_variance"] == 0.0
    assert result["value_variance"] == 0.0
    assert result["percentage_variance"] == 0.0


@pytest.mark.asyncio
async def test_check_thresholds_quantity_exceeded():
    """Test threshold checking when quantity threshold is exceeded"""
    db = MockDB()
    service = VarianceService(db)

    variance_data = {
        "quantity_variance": 5.0,
        "value_variance": 250.0,
        "percentage_variance": 5.0,
    }

    requires_approval, violated = await service.check_thresholds(variance_data)

    assert requires_approval is True
    assert len(violated) >= 1
    assert any(v["threshold_type"] == "quantity" for v in violated)


@pytest.mark.asyncio
async def test_check_thresholds_value_exceeded():
    """Test threshold checking when value threshold is exceeded"""
    db = MockDB()
    service = VarianceService(db)

    variance_data = {
        "quantity_variance": 0.5,  # Below qty threshold
        "value_variance": 600.0,  # Above value threshold
        "percentage_variance": 1.0,
    }

    requires_approval, violated = await service.check_thresholds(variance_data)

    assert requires_approval is True
    assert len(violated) >= 1

    value_violation = next((v for v in violated if v["threshold_type"] == "value"), None)
    assert value_violation is not None
    assert value_violation["require_reason"] is True


@pytest.mark.asyncio
async def test_check_thresholds_not_exceeded():
    """Test threshold checking when no thresholds are exceeded"""
    db = MockDB()
    service = VarianceService(db)

    variance_data = {
        "quantity_variance": 0.5,  # Below threshold
        "value_variance": 25.0,  # Below threshold
        "percentage_variance": 0.5,
    }

    requires_approval, violated = await service.check_thresholds(variance_data)

    assert requires_approval is False
    assert len(violated) == 0


@pytest.mark.asyncio
async def test_calculate_variance_with_zero_expected():
    """Test variance calculation when expected quantity is zero"""
    db = MockDB()
    service = VarianceService(db)

    result = await service.calculate_variance(
        item_code="ITEM004", counted_qty=10, expected_qty=0, unit_price=50
    )

    assert result["quantity_variance"] == 10.0
    assert result["value_variance"] == 500.0
    assert result["percentage_variance"] == 0.0  # Avoid division by zero


@pytest.mark.asyncio
async def test_calculate_variance_fractional():
    """Test variance calculation with fractional quantities"""
    db = MockDB()
    service = VarianceService(db)

    result = await service.calculate_variance(
        item_code="ITEM005", counted_qty=10.5, expected_qty=10.0, unit_price=100.0
    )

    assert result["quantity_variance"] == 0.5
    assert result["value_variance"] == 50.0
    assert result["percentage_variance"] == 5.0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
