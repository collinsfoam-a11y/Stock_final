import ast
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException

# ==============================================================================
# 1. FORBIDDEN WRITES CONTRACT (Static Analysis)
# ==============================================================================
# Rule: Only 'backend/services/sql_verification_service.py' and 'backend/api/item_verification_api.py'
#       are allowed to write to 'verified_qty'.
#       ALL other files are strictly FORBIDDEN.

ALLOWED_WRITERS = [
    "sql_verification_service.py",
    "item_verification_api.py",  # Manual verification allowed
    "test_governance_contracts.py",  # Self-reference
    "seed_sample_data.py",  # Seeding allowed
    "seed_e2e.py",  # Seeding allowed
    # Safe False Positives (References/Definitions/Side-Logs):
    "security.py",
    "query_builder.py",
    "sync_batch_api.py",
    "test_governance_contracts.py",
]


def get_python_files(root_dir):
    ignored_dirs = {
        "tests",
        "venv",
        ".venv",
        "__pycache__",
        "dist",
        "build",
        "node_modules",
        ".git",
        ".github",
    }
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Modify dirnames in-place to skip ignored directories
        dirnames[:] = [d for d in dirnames if d not in ignored_dirs]

        for filename in filenames:
            if filename.endswith(".py"):
                yield os.path.join(dirpath, filename)


def check_for_forbidden_writes(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        try:
            tree = ast.parse(f.read(), filename=file_path)
        except Exception:
            return []  # Skip unparseable files

    violations = []

    for node in ast.walk(tree):
        # Check for dict keys in updates: e.g. {"$set": {"verified_qty": ...}}
        if isinstance(node, ast.Constant) and node.value == "verified_qty":
            # This is a bit loose, catching any string "verified_qty", but safe for governance.
            violations.append(f"Found 'verified_qty' usage at line {node.lineno}")

    return violations


def log_failure(message):
    with open("governance_failures.log", "a") as f:
        f.write(message + "\n")


@pytest.mark.governance
def test_forbidden_writes_contract():
    """
    CONTRACT: No unauthorized service shall write to 'verified_qty'.
    """
    if os.path.exists("governance_failures.log"):
        os.remove("governance_failures.log")

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    violations = []

    for file_path in get_python_files(backend_dir):
        filename = os.path.basename(file_path)
        if filename in ALLOWED_WRITERS:
            continue

        file_violations = check_for_forbidden_writes(file_path)
        if file_violations:
            msg = f"{filename}: {file_violations}"
            violations.append(msg)
            log_failure(msg)

    assert not violations, (
        "Governance Violation: Unauthorized writes to 'verified_qty' found. See governance_failures.log"
    )


# ==============================================================================
# 2. CONCURRENCY LOCK CONTRACT (Optimistic Locking)
# ==============================================================================


@pytest.mark.asyncio
@pytest.mark.governance
async def test_manual_verification_optimistic_lock():
    """
    CONTRACT: Manual verification MUST fail if stock_qty changes between read and write.
    """
    # Mock dependencies
    mock_db = AsyncMock()
    mock_user = {"username": "tester"}

    # Setup Item (Pre-change)
    item = {
        "_id": "item123",
        "barcode": "12345",
        "item_code": "ITEM-001",
        "stock_qty": 100.0,  # Expected qty
        "verified": False,
        "verified_qty": 0,
    }

    # Mock FIND to return the item
    mock_db.erp_items.find_one.return_value = item

    # Mock UPDATE to return match_count=0 (Simulating Optimistic Lock Failure)
    # This means the query {"barcode": "123456", "stock_qty": 100.0} found NOTHING
    # because stock_qty had changed in DB to something else
    mock_update_result = MagicMock()
    mock_update_result.matched_count = 0
    mock_db.erp_items.update_one.return_value = mock_update_result

    # Mock Request
    request = MagicMock()
    request.verified = True
    request.verified_qty = 100.0
    request.session_id = "sess1"
    request.model_dump.return_value = {}  # For logging

    # Patch the module's DB reference
    with patch("backend.api.item_verification_api.db", mock_db):
        from backend.api import item_verification_api

        # We also need to mock build_item_update_doc and calculate_variance since we are unit testing verify_item
        # But actually verify_item logic is complex. Easier to expect the exception.

        try:
            await item_verification_api.verify_item(
                barcode="12345", request=request, current_user=mock_user
            )
            pytest.fail("Should have raised HTTPException(409) due to Optimistic Lock failure")
        except HTTPException as e:
            assert e.status_code == 409
            assert "Optimistic Lock" in e.detail


# ==============================================================================
# 3. SQL SAFETY CONTRACT
# ==============================================================================
# Rule: SQL Verification Service should mostly be reading.
#       Actually, the mandate says "Any SQL query that is not SELECT -> FAIL"
#       This is for the SQLServerConnector's usage in Verification context.


@pytest.mark.governance
def test_sql_read_only_contract():
    """
    CONTRACT: SQL Connector usages in Verification Service must be Read-Only.
    """
    # Scan sql_verification_service.py for "INSERT", "UPDATE", "DELETE", "DROP" strings
    # associated with sql_connector execute calls.

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    target_file = os.path.join(backend_dir, "services", "sql_verification_service.py")

    with open(target_file, "r") as f:
        content = f.read().upper()

    forbidden_keywords = ["INSERT INTO ", "UPDATE ", "DELETE FROM ", "DROP TABLE ", "ALTER TABLE "]

    violations = []
    for keyword in forbidden_keywords:
        if keyword in content:
            # We need to be careful about comments.
            # But in a strict governance file, even mentioning them is suspicious unless validated.
            # For now, simplistic check.
            violations.append(keyword)

    assert not violations, (
        f"Found Potentially Unsafe SQL Keywords in Verification Service: {violations}"
    )
