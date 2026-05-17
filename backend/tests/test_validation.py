import pytest
from unittest.mock import MagicMock, AsyncMock
from backend.utils.validation import (
    validate_mongo_field_name,
    validate_sql_identifier,
    sanitize_for_display,
    verify_insert_result,
    verify_update_result,
    verify_delete_result,
    verify_document_exists,
    save_with_verification,
    update_with_verification,
    ValidationError,
    MongoSaveError,
)


# Test Field Validation
def test_validate_mongo_field_name_success():
    assert validate_mongo_field_name("user_id") == "user_id"
    assert validate_mongo_field_name("valid_field_1") == "valid_field_1"


def test_validate_mongo_field_name_empty():
    with pytest.raises(ValidationError, match="cannot be empty"):
        validate_mongo_field_name("")


def test_validate_mongo_field_name_operator():
    with pytest.raises(ValidationError, match="cannot be a MongoDB operator"):
        validate_mongo_field_name("$set")
    with pytest.raises(ValidationError, match="cannot be a MongoDB operator"):
        validate_mongo_field_name("$where")


def test_validate_mongo_field_name_pattern_caps():
    with pytest.raises(ValidationError):
        validate_mongo_field_name("UserId")


def test_validate_mongo_field_name_length():
    with pytest.raises(ValidationError, match="max 63 characters"):
        validate_mongo_field_name("a" * 64)


def test_validate_mongo_field_name_underscores():
    with pytest.raises(ValidationError, match="consecutive underscores"):
        validate_mongo_field_name("user__id")


def test_validate_mongo_field_name_start_underscore():
    # _id fails the pattern check (must start with lowercase letter)
    # So the specific "start with underscore" check is actually unreachable
    # unless the pattern is changed.
    with pytest.raises(ValidationError):
        validate_mongo_field_name("_id")


def test_validate_sql_identifier_success():
    assert validate_sql_identifier("users") == "users"
    assert validate_sql_identifier("user_table_1") == "user_table_1"


def test_validate_sql_identifier_empty():
    with pytest.raises(ValidationError, match="cannot be empty"):
        validate_sql_identifier("")


def test_validate_sql_identifier_length():
    with pytest.raises(ValidationError, match="exceeds 10 characters"):
        validate_sql_identifier("long_identifier", max_length=10)


def test_validate_sql_identifier_brackets():
    with pytest.raises(ValidationError, match="cannot contain brackets"):
        validate_sql_identifier("[users]")


def test_validate_sql_identifier_dangerous():
    with pytest.raises(ValidationError, match="forbidden character"):
        validate_sql_identifier("users;drop")
    with pytest.raises(ValidationError, match="forbidden character"):
        validate_sql_identifier("users--")


def test_validate_sql_identifier_pattern():
    with pytest.raises(ValidationError, match="alphanumeric, space, underscore"):
        validate_sql_identifier("user@table")


def test_sanitize_for_display():
    assert sanitize_for_display("valid input") == "valid input"
    assert sanitize_for_display("input\0with\0nulls") == "inputwithnulls"
    assert len(sanitize_for_display("a" * 200, max_length=10)) == 10
    assert (
        sanitize_for_display(None) == ""
    )  # Although type hint says str, handling None gracefully is good, but code says `if not value: return ""`


# Test MongoDB Result Verification


def test_verify_insert_result_success():
    mock_result = MagicMock()
    mock_result.acknowledged = True
    mock_result.inserted_id = "507f1f77bcf86cd799439011"

    assert verify_insert_result(mock_result, "test_col") == "507f1f77bcf86cd799439011"


def test_verify_insert_result_none():
    with pytest.raises(MongoSaveError, match="returned no result"):
        verify_insert_result(None, "test_col")


def test_verify_insert_result_not_acknowledged():
    mock_result = MagicMock()
    mock_result.acknowledged = False
    with pytest.raises(MongoSaveError, match="not acknowledged"):
        verify_insert_result(mock_result, "test_col")


def test_verify_insert_result_no_id():
    mock_result = MagicMock()
    mock_result.acknowledged = True
    mock_result.inserted_id = None
    with pytest.raises(MongoSaveError, match="did not return an inserted_id"):
        verify_insert_result(mock_result, "test_col")


def test_verify_update_result_success():
    mock_result = MagicMock()
    mock_result.acknowledged = True
    mock_result.matched_count = 1
    mock_result.modified_count = 1
    mock_result.upserted_id = None

    info = verify_update_result(mock_result, "test_col")
    assert info["matched_count"] == 1
    assert info["modified_count"] == 1
    assert not info["was_upsert"]


def test_verify_update_result_upsert():
    mock_result = MagicMock()
    mock_result.acknowledged = True
    mock_result.matched_count = 0
    mock_result.modified_count = 0
    mock_result.upserted_id = "507f1f77bcf86cd799439011"

    info = verify_update_result(mock_result, "test_col")
    assert info["was_upsert"]
    assert info["upserted_id"] == "507f1f77bcf86cd799439011"


def test_verify_update_result_match_failure():
    mock_result = MagicMock()
    mock_result.acknowledged = True
    mock_result.matched_count = 0
    mock_result.upserted_id = None

    with pytest.raises(MongoSaveError, match="matched 0 documents"):
        verify_update_result(mock_result, "test_col", expected_match=1)


def test_verify_update_result_modification_failure():
    mock_result = MagicMock()
    mock_result.acknowledged = True
    mock_result.matched_count = 1
    mock_result.modified_count = 0
    mock_result.upserted_id = None

    with pytest.raises(MongoSaveError, match="none were modified"):
        verify_update_result(mock_result, "test_col", require_modification=True)


def test_verify_delete_result_success():
    mock_result = MagicMock()
    mock_result.acknowledged = True
    mock_result.deleted_count = 1

    assert verify_delete_result(mock_result, "test_col") == 1


def test_verify_delete_result_failure():
    mock_result = MagicMock()
    mock_result.acknowledged = True
    mock_result.deleted_count = 0

    with pytest.raises(MongoSaveError, match="Deleted 0 documents"):
        verify_delete_result(mock_result, "test_col", expected_count=1)


# Async Tests


@pytest.mark.asyncio
async def test_verify_document_exists_success():
    collection = AsyncMock()
    collection.find_one.return_value = {"_id": "123"}

    assert await verify_document_exists(collection, {"_id": "123"}, "test_col")


@pytest.mark.asyncio
async def test_verify_document_exists_failure():
    collection = AsyncMock()
    collection.find_one.return_value = None

    with pytest.raises(MongoSaveError, match="Document not found"):
        await verify_document_exists(collection, {"_id": "123"}, "test_col")


@pytest.mark.asyncio
async def test_verify_document_exists_error():
    collection = AsyncMock()
    collection.find_one.side_effect = Exception("DB Error")

    with pytest.raises(MongoSaveError, match="Failed to verify"):
        await verify_document_exists(collection, {"_id": "123"}, "test_col")


@pytest.mark.asyncio
async def test_save_with_verification_success():
    collection = AsyncMock()
    mock_result = MagicMock()
    mock_result.acknowledged = True
    mock_result.inserted_id = "123"
    collection.insert_one.return_value = mock_result
    collection.find_one.return_value = {"_id": "123"}

    doc = {"name": "test"}
    result = await save_with_verification(collection, doc, "test_col")

    assert result["_mongo_id"] == "123"
    collection.insert_one.assert_called_once_with(doc)
    collection.find_one.assert_called_once()


@pytest.mark.asyncio
async def test_save_with_verification_insert_fail():
    collection = AsyncMock()
    mock_result = MagicMock()
    mock_result.acknowledged = False  # Fail insert
    collection.insert_one.return_value = mock_result

    with pytest.raises(MongoSaveError, match="not acknowledged"):
        await save_with_verification(collection, {"name": "test"}, "test_col")


@pytest.mark.asyncio
async def test_save_with_verification_verify_fail():
    collection = AsyncMock()
    mock_result = MagicMock()
    mock_result.acknowledged = True
    mock_result.inserted_id = "123"
    collection.insert_one.return_value = mock_result
    collection.find_one.return_value = None  # Verify fails

    with pytest.raises(MongoSaveError, match="Document not found"):
        await save_with_verification(collection, {"name": "test"}, "test_col")


@pytest.mark.asyncio
async def test_update_with_verification_success():
    collection = AsyncMock()
    mock_result = MagicMock()
    mock_result.acknowledged = True
    mock_result.matched_count = 1
    mock_result.modified_count = 1
    collection.update_one.return_value = mock_result
    collection.find_one.return_value = {"_id": "123"}

    info = await update_with_verification(
        collection, {"_id": "123"}, {"$set": {"a": 1}}, "test_col"
    )

    assert info["matched_count"] == 1
    assert info["modified_count"] == 1


@pytest.mark.asyncio
async def test_update_with_verification_error():
    collection = AsyncMock()
    collection.update_one.side_effect = Exception("DB Error")

    with pytest.raises(MongoSaveError, match="Failed to update"):
        await update_with_verification(collection, {"_id": "123"}, {"$set": {"a": 1}}, "test_col")
