from unittest.mock import AsyncMock, MagicMock

from backend.db_mapping_config import (
    BATCH_COLUMN_MAP,
    PRODUCTS_COLUMN_MAP,
    TABLE_MAPPINGS,
    get_active_mapping,
    load_active_mapping,
)


def _mock_db(doc):
    db = MagicMock()
    db.config.find_one = AsyncMock(return_value=doc)
    return db


async def test_load_active_mapping_falls_back_to_defaults_when_no_doc():
    db = _mock_db(None)

    mapping = await load_active_mapping(db)

    assert mapping == get_active_mapping()


async def test_load_active_mapping_applies_valid_table_override():
    db = _mock_db({"mapping": {"tables": {"items": "CustomProducts"}}})

    mapping = await load_active_mapping(db)

    assert mapping["tables"]["items"] == "CustomProducts"
    # Untouched keys keep their defaults
    assert mapping["tables"]["item_batches"] == TABLE_MAPPINGS["item_batches"]


async def test_load_active_mapping_applies_valid_column_overrides():
    db = _mock_db(
        {
            "mapping": {
                "items_columns": {"item_code": "SKU"},
                "batch_columns": {"stock_qty": "OnHandQty"},
            }
        }
    )

    mapping = await load_active_mapping(db)

    assert mapping["items_columns"]["item_code"] == "SKU"
    assert mapping["batch_columns"]["stock_qty"] == "OnHandQty"
    assert mapping["items_columns"]["item_name"] == PRODUCTS_COLUMN_MAP["item_name"]
    assert mapping["batch_columns"]["item_code"] == BATCH_COLUMN_MAP["item_code"]


async def test_load_active_mapping_ignores_unknown_keys():
    db = _mock_db({"mapping": {"tables": {"not_a_real_field": "DROP TABLE Products;"}}})

    mapping = await load_active_mapping(db)

    assert "not_a_real_field" not in mapping["tables"]
    assert mapping["tables"] == TABLE_MAPPINGS


async def test_load_active_mapping_rejects_non_identifier_values():
    db = _mock_db({"mapping": {"tables": {"items": "Products; DROP TABLE Products;"}}})

    mapping = await load_active_mapping(db)

    # Invalid override is dropped, default is kept
    assert mapping["tables"]["items"] == TABLE_MAPPINGS["items"]


async def test_load_active_mapping_survives_db_errors():
    db = MagicMock()
    db.config.find_one = AsyncMock(side_effect=RuntimeError("mongo down"))

    mapping = await load_active_mapping(db)

    assert mapping == get_active_mapping()
