"""
Comprehensive test suite for count_lines_api.py
Target: Increase coverage from 18% to 85%
"""

from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import HTTPException

from backend.api.count_lines_routes import (
    CountLineApprovalRequest,
    CountLineRejectRequest,
    _require_supervisor,
    approve_count_line,
    calculate_financial_impact,
    check_serial_uniqueness,
    create_count_line,
    detect_risk_flags,
    get_count_lines,
    reject_count_line,
    save_count_line_draft,
    unverify_stock,
    verify_stock,
)
from backend.api.schemas import CountLineCreate


@pytest.fixture(autouse=True)
def reset_globals():
    """Reset global services before each test"""
    with (
        patch("backend.api.count_lines_routes._activity_log_service", None),
        patch("backend.api.count_lines_routes._lock_service", None),
        patch("backend.api.count_lines_routes._snapshot_service", None),
        patch("backend.api.count_lines_routes._variant_service", None),
    ):
        yield


class TestCheckSerialUniqueness:
    @pytest.fixture
    def mock_db(self):
        db = AsyncMock()
        db.count_lines.find_one = AsyncMock(return_value=None)
        return db

    @pytest.mark.asyncio
    async def test_returns_false_when_serial_not_found(self, mock_db):
        with patch("backend.api.count_lines_routes.get_db", return_value=mock_db):
            result = await check_serial_uniqueness(
                session_id="sess_1",
                serial_number="ABC123",
                current_user={"username": "staff1", "role": "staff"},
            )

        assert result == {"exists": False}

    @pytest.mark.asyncio
    async def test_returns_details_when_serial_found(self, mock_db):
        record = {
            "item_code": "ITEM001",
            "item_name": "Widget",
            "counted_by": "staff1",
            "floor_no": "1",
            "rack_no": "A1",
            "status": "pending",
        }
        mock_db.count_lines.find_one = AsyncMock(side_effect=[None, record])

        with patch("backend.api.count_lines_routes.get_db", return_value=mock_db):
            result = await check_serial_uniqueness(
                session_id="sess_1",
                serial_number="abc123",
                current_user={"username": "staff1", "role": "staff"},
            )

        assert result["exists"] is True
        for key, value in record.items():
            assert result[key] == value


class TestCountLinesAPIHelpers:
    """Test helper functions"""

    def test_detect_risk_flags_large_variance(self):
        """Test risk flag detection for large variance"""
        erp_item = {"stock_qty": 100, "mrp": 100}
        line_data = Mock()
        line_data.mrp_counted = 100
        line_data.serial_numbers = []
        line_data.correction_reason = None
        line_data.variance_reason = None
        line_data.photo_base64 = None
        line_data.photo_proofs = []

        variance = 150  # Large variance
        risk_flags = detect_risk_flags(erp_item, line_data, variance)

        assert "LARGE_VARIANCE" in risk_flags

    def test_detect_risk_flags_mrp_reduced(self):
        """Test risk flag detection for MRP reduction"""
        erp_item = {"stock_qty": 50, "mrp": 100}
        line_data = Mock()
        line_data.mrp_counted = 70  # 30% reduction
        line_data.serial_numbers = []
        line_data.correction_reason = None
        line_data.variance_reason = None
        line_data.photo_base64 = None
        line_data.photo_proofs = []

        variance = 0
        risk_flags = detect_risk_flags(erp_item, line_data, variance)

        assert "MRP_REDUCED_SIGNIFICANTLY" in risk_flags

    def test_detect_risk_flags_high_value_variance(self):
        """Test risk flag detection for high-value items with variance"""
        erp_item = {"stock_qty": 10, "mrp": 15000}
        line_data = Mock()
        line_data.mrp_counted = 15000
        line_data.serial_numbers = []
        line_data.correction_reason = None
        line_data.variance_reason = None
        line_data.photo_base64 = None
        line_data.photo_proofs = []

        variance = 1  # Small variance but high-value item
        risk_flags = detect_risk_flags(erp_item, line_data, variance)

        assert "HIGH_VALUE_VARIANCE" in risk_flags

    def test_detect_risk_flags_serial_missing_high_value(self):
        """Test risk flag detection for missing serial numbers on high-value items"""
        erp_item = {"stock_qty": 5, "mrp": 8000}
        line_data = Mock()
        line_data.mrp_counted = 8000
        line_data.serial_numbers = []  # Missing
        line_data.correction_reason = None
        line_data.variance_reason = None
        line_data.photo_base64 = None
        line_data.photo_proofs = []

        variance = 0
        risk_flags = detect_risk_flags(erp_item, line_data, variance)

        assert "SERIAL_MISSING_HIGH_VALUE" in risk_flags

    def test_detect_risk_flags_missing_correction_reason(self):
        """Test risk flag detection for missing correction reason"""
        erp_item = {"stock_qty": 50, "mrp": 100}
        line_data = Mock()
        line_data.mrp_counted = 100
        line_data.serial_numbers = []
        line_data.correction_reason = None
        line_data.variance_reason = None  # Missing
        line_data.photo_base64 = None
        line_data.photo_proofs = []

        variance = 10  # Has variance but no reason
        risk_flags = detect_risk_flags(erp_item, line_data, variance)

        assert "MISSING_CORRECTION_REASON" in risk_flags

    def test_detect_risk_flags_mrp_change_without_reason(self):
        """Test risk flag detection for MRP change without reason"""
        erp_item = {"stock_qty": 50, "mrp": 100}
        line_data = Mock()
        line_data.mrp_counted = 110  # 10% change
        line_data.serial_numbers = []
        line_data.correction_reason = None
        line_data.variance_reason = None
        line_data.photo_base64 = None
        line_data.photo_proofs = []

        variance = 0
        risk_flags = detect_risk_flags(erp_item, line_data, variance)

        assert "MRP_CHANGE_WITHOUT_REASON" in risk_flags

    def test_detect_risk_flags_photo_required_missing(self):
        """Test risk flag detection for required photo proof missing"""
        erp_item = {"stock_qty": 200, "mrp": 100}
        line_data = Mock()
        line_data.mrp_counted = 100
        line_data.serial_numbers = []
        line_data.correction_reason = None
        line_data.variance_reason = None
        line_data.photo_base64 = None  # Missing
        line_data.photo_proofs = []  # Missing

        variance = 150  # Large variance requires photo
        risk_flags = detect_risk_flags(erp_item, line_data, variance)

        assert "PHOTO_PROOF_REQUIRED" in risk_flags

    def test_detect_risk_flags_no_flags(self):
        """Test that no risk flags are detected for normal corrections"""
        erp_item = {"stock_qty": 50, "mrp": 100}
        line_data = Mock()
        line_data.mrp_counted = 100
        line_data.serial_numbers = []
        line_data.correction_reason = Mock()
        line_data.variance_reason = Mock()
        line_data.photo_base64 = "photo_data"
        line_data.photo_proofs = [Mock()]

        variance = 5  # Small variance
        risk_flags = detect_risk_flags(erp_item, line_data, variance)

        assert len(risk_flags) == 0

    def test_calculate_financial_impact(self):
        """Test financial impact calculation"""
        impact = calculate_financial_impact(100, 120, 10)
        expected = (120 - 100) * 10  # 200
        assert impact == expected

    def test_calculate_financial_impact_negative(self):
        """Test financial impact calculation for negative impact"""
        impact = calculate_financial_impact(100, 80, 10)
        expected = (80 - 100) * 10  # -200
        assert impact == expected

    def test_require_supervisor_valid_role(self):
        """Test _require_supervisor with valid role"""
        current_user = {"role": "supervisor"}
        # Should not raise exception
        _require_supervisor(current_user)

    def test_require_supervisor_admin_role(self):
        """Test _require_supervisor with admin role"""
        current_user = {"role": "admin"}
        # Should not raise exception
        _require_supervisor(current_user)

    def test_require_supervisor_invalid_role(self):
        """Test _require_supervisor with invalid role"""
        current_user = {"role": "staff"}
        with pytest.raises(HTTPException) as exc_info:
            _require_supervisor(current_user)
        assert exc_info.value.status_code == 403


class TestCreateCountLine:
    """Test create_count_line endpoint"""

    @pytest.fixture
    def mock_db(self):
        """Create mock database"""
        db = AsyncMock()
        db.sessions.find_one = AsyncMock()
        db.erp_items.find_one = AsyncMock()
        db.count_lines.count_documents = AsyncMock(return_value=0)
        db.count_lines.find_one = AsyncMock(return_value=None)
        db.count_lines.insert_one = AsyncMock()
        db.sessions.update_one = AsyncMock()
        db.count_lines.aggregate = AsyncMock(
            return_value=AsyncMock(to_list=AsyncMock(return_value=[]))
        )
        db.count_lines.update_one = AsyncMock()
        mock_find_cursor = Mock()
        mock_find_cursor.sort.return_value = mock_find_cursor
        mock_find_cursor.skip.return_value = mock_find_cursor
        mock_find_cursor.limit.return_value = mock_find_cursor
        mock_find_cursor.to_list = AsyncMock(return_value=[])
        db.count_lines.find = Mock(return_value=mock_find_cursor)
        db.count_lines.delete_one = AsyncMock()
        db.count_line_drafts.find_one = AsyncMock(return_value=None)
        db.count_line_drafts.insert_one = AsyncMock(return_value=Mock(inserted_id="draft123"))
        db.count_line_drafts.update_one = AsyncMock()
        return db

    @pytest.fixture
    def line_data(self):
        """Create mock line data"""
        return CountLineCreate(
            session_id="session123",
            item_code="ITEM001",
            counted_qty=50,
            floor_no="F1",
            rack_no="R1",
            variance_reason="test_reason",
        )

    @pytest.fixture
    def erp_item(self):
        """Create mock ERP item"""
        return {
            "item_name": "Test Item",
            "barcode": "123456789",
            "stock_qty": 40,
            "mrp": 100,
        }

    @pytest.mark.asyncio
    async def test_create_count_line_success(self, mock_db, line_data, erp_item):
        """Test successful count line creation"""
        mock_db.sessions.find_one.return_value = {"id": "session123", "status": "OPEN"}
        mock_db.erp_items.find_one.return_value = erp_item
        mock_db.count_lines.count_documents = AsyncMock(return_value=0)  # No duplicate
        mock_db.count_lines.find_one = AsyncMock(return_value=None)  # No existing count
        mock_db.count_lines.insert_one = AsyncMock()
        mock_db.sessions.update_one = AsyncMock()

        with patch("backend.api.count_lines_routes.get_db", return_value=mock_db):
            result = await create_count_line(
                request=AsyncMock(),
                line_data=line_data,
                current_user={"username": "testuser"},
            )

        assert result["session_id"] == "session123"
        assert result["item_code"] == "ITEM001"
        assert result["counted_qty"] == 50
        assert result["variance"] == 10
        assert result["counted_by"] == "testuser"
        assert result["approval_status"] == "PENDING"
        mock_db.count_line_drafts.update_one.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_create_count_line_session_not_found(self, mock_db, line_data):
        """Test count line creation with non-existent session"""
        mock_db.sessions.find_one.return_value = None

        with patch("backend.api.count_lines_routes.get_db", return_value=mock_db):
            with pytest.raises(HTTPException) as exc_info:
                await create_count_line(
                    request=AsyncMock(),
                    line_data=line_data,
                    current_user={"username": "testuser"},
                )

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_create_count_line_item_not_found(self, mock_db, line_data):
        """Test count line creation with non-existent item"""
        mock_db.sessions.find_one.return_value = {"id": "session123", "status": "OPEN"}
        mock_db.erp_items.find_one.return_value = None

        with patch("backend.api.count_lines_routes.get_db", return_value=mock_db):
            with pytest.raises(HTTPException) as exc_info:
                await create_count_line(
                    request=AsyncMock(),
                    line_data=line_data,
                    current_user={"username": "testuser"},
                )

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_create_count_line_variance_without_reason(self, mock_db, line_data, erp_item):
        """Test count line creation with variance but no reason"""
        line_data.variance_reason = None
        line_data.correction_reason = None
        mock_db.sessions.find_one.return_value = {"id": "session123", "status": "OPEN"}
        mock_db.erp_items.find_one.return_value = erp_item

        with patch("backend.api.count_lines_routes.get_db", return_value=mock_db):
            with pytest.raises(HTTPException) as exc_info:
                await create_count_line(
                    request=AsyncMock(),
                    line_data=line_data,
                    current_user={"username": "testuser"},
                )

        assert exc_info.value.status_code == 400
        assert "Correction reason is mandatory" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_create_count_line_duplicate(self, mock_db, line_data, erp_item):
        """Test count line creation with duplicate detection"""
        mock_db.sessions.find_one.return_value = {"id": "session123", "status": "OPEN"}
        mock_db.erp_items.find_one.return_value = erp_item
        mock_db.count_lines.count_documents = AsyncMock(return_value=1)  # Duplicate exists
        mock_db.count_lines.find_one = AsyncMock(return_value={"id": "existing", "status": "approved"})  # Existing count

        mock_find_cursor = Mock()
        mock_find_cursor.sort.return_value = mock_find_cursor
        mock_find_cursor.skip.return_value = mock_find_cursor
        mock_find_cursor.limit.return_value = mock_find_cursor
        mock_find_cursor.to_list = AsyncMock(
            return_value=[{"id": "existing", "status": "approved", "counted_qty": 50, "version": 1}]
        )
        mock_db.count_lines.find = Mock(return_value=mock_find_cursor)

        with patch("backend.api.count_lines_routes.get_db", return_value=mock_db):
            result = await create_count_line(
                request=AsyncMock(),
                line_data=line_data,
                current_user={"username": "testuser"},
            )

        assert result["session_id"] == "session123"
        assert result.get("is_conflict") is True

    @pytest.mark.asyncio
    async def test_create_count_line_high_risk(self, mock_db, line_data, erp_item):
        """Test count line creation with high-risk flags"""
        # Create scenario with high variance
        line_data.counted_qty = 200  # Large variance
        erp_item["stock_qty"] = 50
        erp_item["mrp"] = 500  # High value item
        mock_db.sessions.find_one.return_value = {"id": "session123", "status": "OPEN"}
        mock_db.erp_items.find_one.return_value = erp_item
        mock_db.count_lines.count_documents = AsyncMock(return_value=0)  # No duplicate
        mock_db.count_lines.find_one = AsyncMock(return_value=None)  # No existing count

        with patch("backend.api.count_lines_routes.get_db", return_value=mock_db):
            result = await create_count_line(
                request=AsyncMock(),
                line_data=line_data,
                current_user={"username": "testuser"},
            )

        assert result["approval_status"] == "NEEDS_REVIEW"
        assert len(result["risk_flags"]) > 0

    @pytest.mark.asyncio
    async def test_save_count_line_draft_persists(self, mock_db, line_data):
        with patch("backend.api.count_lines_routes.get_db", return_value=mock_db):
            result = await save_count_line_draft(
                request=AsyncMock(),
                line_data=line_data,
                current_user={"username": "testuser"},
            )

        assert result["success"] is True
        assert result["data"]["status"] == "draft"
        mock_db.count_line_drafts.insert_one.assert_awaited_once()


class TestVerifyStock:
    """Test verify_stock function"""

    @pytest.mark.asyncio
    async def test_verify_stock_success(self):
        """Test successful stock verification"""
        mock_db = AsyncMock()
        mock_db.count_lines.update_one = AsyncMock(return_value=Mock(modified_count=1))

        with patch("backend.api.count_lines_routes.get_db", return_value=mock_db):
            result = await verify_stock(
                line_id="line123",
                current_user={"username": "supervisor", "role": "supervisor"},
                request=AsyncMock(),
            )

        assert result["verified"] is True
        assert mock_db.count_lines.update_one.called

    @pytest.mark.asyncio
    async def test_verify_stock_not_found(self):
        """Test stock verification with non-existent line"""
        mock_db = AsyncMock()
        mock_db.count_lines.update_one = AsyncMock(return_value=Mock(modified_count=0))

        with patch("backend.api.count_lines_routes.get_db", return_value=mock_db):
            with pytest.raises(HTTPException) as exc_info:
                await verify_stock(
                    line_id="nonexistent",
                    current_user={"username": "supervisor", "role": "supervisor"},
                    request=AsyncMock(),
                )

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_verify_stock_insufficient_permissions(self):
        """Test stock verification with insufficient permissions"""
        with pytest.raises(HTTPException) as exc_info:
            await verify_stock(
                line_id="line123",
                current_user={"username": "staff", "role": "staff"},
                request=AsyncMock(),
            )

        assert exc_info.value.status_code == 403


class TestUnverifyStock:
    """Test unverify_stock function"""

    @pytest.mark.asyncio
    async def test_unverify_stock_success(self):
        """Test successful stock unverification"""
        mock_db = AsyncMock()
        mock_db.count_lines.update_one = AsyncMock(return_value=Mock(modified_count=1))

        with patch("backend.api.count_lines_routes.get_db", return_value=mock_db):
            result = await unverify_stock(
                line_id="line123",
                current_user={"username": "supervisor", "role": "supervisor"},
                request=AsyncMock(),
            )

        assert result["verified"] is False
        assert mock_db.count_lines.update_one.called

    @pytest.mark.asyncio
    async def test_unverify_stock_not_found(self):
        """Test stock unverification with non-existent line"""
        mock_db = AsyncMock()
        mock_db.count_lines.update_one = AsyncMock(return_value=Mock(modified_count=0))

        with patch("backend.api.count_lines_routes.get_db", return_value=mock_db):
            with pytest.raises(HTTPException) as exc_info:
                await unverify_stock(
                    line_id="nonexistent",
                    current_user={"username": "supervisor", "role": "supervisor"},
                    request=AsyncMock(),
                )

        assert exc_info.value.status_code == 404


class TestApprovalWorkflow:
    """Test the live approve/reject workflow used by the app."""

    @pytest.mark.asyncio
    async def test_approve_count_line_notifies_owner(self):
        mock_db = AsyncMock()
        mock_db.count_lines.find_one = AsyncMock(
            return_value={
                "_id": "mongo-id-1",
                "id": "line123",
                "session_id": "session123",
                "item_code": "ITEM001",
                "barcode": "123456",
                "item_name": "Test Item",
                "counted_by": "staff1",
            }
        )
        mock_db.count_lines.update_one = AsyncMock(return_value=Mock(matched_count=1))

        notification_service = AsyncMock()
        notification_service.notify_count_approved = AsyncMock()
        audit_service = AsyncMock()
        audit_service.log_event = AsyncMock()

        with (
            patch("backend.api.count_lines_routes._get_db_client", return_value=mock_db),
            patch(
                "backend.api.count_lines_routes.NotificationService",
                return_value=notification_service,
            ),
            patch("backend.services.audit_service.AuditService", return_value=audit_service),
        ):
            result = await approve_count_line(
                line_id="line123",
                request=CountLineApprovalRequest(notes="Looks good"),
                current_user={"username": "supervisor", "role": "supervisor"},
            )

        assert result["success"] is True
        mock_db.count_lines.update_one.assert_called_once()
        update_doc = mock_db.count_lines.update_one.call_args.args[1]["$set"]
        assert update_doc["status"] == "approved"
        assert update_doc["approval_status"] == "APPROVED"
        assert update_doc["approval_note"] == "Looks good"
        notification_service.notify_count_approved.assert_awaited_once_with(
            user_id="staff1",
            count_line_id="line123",
            item_name="Test Item",
            approved_by="supervisor",
            session_id="session123",
            item_code="ITEM001",
            barcode="123456",
        )

    @pytest.mark.asyncio
    async def test_reject_count_line_assigns_recount_and_notifies_both_users(self):
        mock_db = AsyncMock()
        mock_db.count_lines.find_one = AsyncMock(
            return_value={
                "_id": "mongo-id-2",
                "id": "line456",
                "session_id": "session456",
                "item_code": "ITEM002",
                "barcode": "654321",
                "item_name": "Second Item",
                "counted_by": "staff1",
            }
        )
        mock_db.count_lines.update_one = AsyncMock(return_value=Mock(matched_count=1))

        notification_service = AsyncMock()
        notification_service.notify_count_rejected = AsyncMock()
        notification_service.notify_recount_assigned = AsyncMock()

        with (
            patch("backend.api.count_lines_routes._get_db_client", return_value=mock_db),
            patch(
                "backend.api.count_lines_routes.NotificationService",
                return_value=notification_service,
            ),
        ):
            result = await reject_count_line(
                line_id="line456",
                request=CountLineRejectRequest(
                    notes="Recount with fresh check",
                    assign_to="staff2",
                ),
                current_user={"username": "supervisor", "role": "supervisor"},
            )

        assert result["success"] is True
        assert result["assigned_to"] == "staff2"
        update_doc = mock_db.count_lines.update_one.call_args.args[1]["$set"]
        assert update_doc["status"] == "rejected"
        assert update_doc["assigned_to"] == "staff2"
        assert update_doc["rejection_reason"] == "Recount with fresh check"
        notification_service.notify_count_rejected.assert_awaited_once_with(
            user_id="staff1",
            count_line_id="line456",
            item_name="Second Item",
            reason="Recount with fresh check",
            rejected_by="supervisor",
            session_id="session456",
            item_code="ITEM002",
            barcode="654321",
        )
        notification_service.notify_recount_assigned.assert_awaited_once_with(
            user_id="staff2",
            count_line_id="line456",
            item_name="Second Item",
            reason="Recount with fresh check",
            assigned_by="supervisor",
            session_id="session456",
            item_code="ITEM002",
            barcode="654321",
            assigned_to="staff2",
        )


class TestGetCountLines:
    """Test get_count_lines function"""

    @pytest.mark.asyncio
    async def test_get_count_lines_basic(self):
        """Test basic count lines retrieval"""
        mock_db = Mock()
        mock_db.count_lines.count_documents = AsyncMock(return_value=100)
        mock_find_cursor = Mock()
        mock_find_cursor.sort.return_value = mock_find_cursor
        mock_find_cursor.skip.return_value = mock_find_cursor
        mock_find_cursor.limit.return_value = mock_find_cursor
        mock_find_cursor.to_list = AsyncMock(
            return_value=[
                {"id": "1", "session_id": "session123", "counted_qty": 50},
                {"id": "2", "session_id": "session123", "counted_qty": 30},
            ]
        )
        mock_db.count_lines.find.return_value = mock_find_cursor

        with patch("backend.api.count_lines_routes._get_db_client", return_value=mock_db):
            result = await get_count_lines(
                session_id="session123",
                current_user={"username": "testuser"},
                page=1,
                page_size=50,
            )

        assert len(result["items"]) == 2
        assert result["pagination"]["total"] == 100
        assert result["pagination"]["page"] == 1
        assert result["pagination"]["page_size"] == 50

    @pytest.mark.asyncio
    async def test_get_count_lines_with_verified_filter(self):
        """Test count lines retrieval with verified filter"""
        mock_db = Mock()
        mock_db.count_lines.count_documents = AsyncMock(return_value=50)
        mock_find_cursor = Mock()
        mock_find_cursor.sort.return_value = mock_find_cursor
        mock_find_cursor.skip.return_value = mock_find_cursor
        mock_find_cursor.limit.return_value = mock_find_cursor
        mock_find_cursor.to_list = AsyncMock(
            return_value=[
                {
                    "id": "3",
                    "session_id": "session123",
                    "counted_qty": 20,
                    "verified": True,
                }
            ]
        )
        mock_db.count_lines.find.return_value = mock_find_cursor

        with patch("backend.api.count_lines_routes._get_db_client", return_value=mock_db):
            result = await get_count_lines(
                session_id="session123",
                current_user={"username": "testuser"},
                page=1,
                page_size=50,
                verified=True,
            )

        assert len(result["items"]) == 1
        assert result["items"][0]["verified"] is True
        assert result["pagination"]["total"] == 50


class TestCountLinesAPIEdgeCases:
    def test_detect_risk_flags_edge_cases(self):
        """Test risk flag detection with edge cases"""
        # Test with zero values
        erp_item = {"stock_qty": 0, "mrp": 0}
        line_data = Mock()
        line_data.mrp_counted = 0
        line_data.serial_numbers = []
        line_data.correction_reason = None
        line_data.variance_reason = None
        line_data.photo_base64 = None
        line_data.photo_proofs = []

        variance = 0
        risk_flags = detect_risk_flags(erp_item, line_data, variance)

        # Should not crash with zero values
        assert isinstance(risk_flags, list)

    def test_calculate_financial_impact_edge_cases(self):
        """Test financial impact calculation with edge cases"""
        # Test with zero quantity
        impact = calculate_financial_impact(100, 120, 0)
        assert impact == 0

        # Test with zero MRP
        impact = calculate_financial_impact(0, 0, 10)
        assert impact == 0

    @pytest.mark.asyncio
    async def test_create_count_line_session_stats_error(self):
        """Test count line creation when session stats update fails"""
        mock_db = Mock()
        mock_db.sessions.find_one.return_value = {"id": "session123", "status": "OPEN"}
        mock_db.erp_items.find_one.return_value = {
            "item_name": "Test Item",
            "barcode": "123456789",
            "stock_qty": 40,
            "mrp": 100,
        }
        mock_db.count_lines.count_documents = AsyncMock(return_value=0)
        mock_db.count_lines.find_one = AsyncMock(return_value=None)
        mock_db.count_lines.insert_one = AsyncMock()
        mock_find_cursor = Mock()
        mock_find_cursor.sort.return_value = mock_find_cursor
        mock_find_cursor.skip.return_value = mock_find_cursor
        mock_find_cursor.limit.return_value = mock_find_cursor
        mock_find_cursor.to_list = AsyncMock(return_value=[])
        mock_db.count_lines.find = Mock(return_value=mock_find_cursor)
        # Simulate error in session stats update
        mock_db.count_lines.aggregate = AsyncMock(side_effect=Exception("Database error"))
        mock_db.sessions.update_one = AsyncMock()

        with patch("backend.api.count_lines_routes._get_db_client", return_value=mock_db):
            # Should still succeed despite stats update error
            result = await create_count_line(
                request=AsyncMock(),
                line_data=CountLineCreate(
                    session_id="session123",
                    item_code="ITEM001",
                    counted_qty=50,
                    variance_reason="test_reason",
                ),
                current_user={"username": "testuser"},
            )

        assert result["session_id"] == "session123"
