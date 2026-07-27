from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.services.inventory_identity_service import (
    InventoryIdentityError,
    InventoryIdentityService,
    build_identity,
    canonical_inventory_id,
    collision_report,
    merge_identities,
    normalize_item_identifier,
)


def test_normalization_and_id_are_stable():
    assert normalize_item_identifier(" ab 12 ") == "AB12"
    assert canonical_inventory_id("AB12") == canonical_inventory_id("AB12")


def test_build_identity_collects_deduplicated_aliases():
    identity = build_identity(
        {
            "_id": "source-1",
            "item_code": " Item-01 ",
            "item_name": "Widget",
            "barcode": "12345",
            "autobarcode": "12345",
            "manual_barcode": " 99 88 ",
        }
    )
    assert identity.normalized_code == "ITEM-01"
    assert identity.source_record_ids == ["source-1"]
    assert sorted(alias.normalized_value for alias in identity.aliases) == [
        "12345",
        "9988",
        "ITEM-01",
    ]


def test_collision_report_is_deterministic():
    report = collision_report(
        [
            {"_id": "b", "item_code": "ITEM-B", "barcode": "100"},
            {"_id": "a", "item_code": "ITEM-A", "barcode": "100"},
        ]
    )
    assert report == {
        "100": [
            {"normalized_code": "ITEM-A", "source_id": "a"},
            {"normalized_code": "ITEM-B", "source_id": "b"},
        ]
    }


def test_merge_combines_variants_for_same_item_deterministically():
    identities = merge_identities(
        [
            {
                "_id": "2",
                "item_code": " item-1 ",
                "barcode": "200",
                "item_name": "Widget",
            },
            {
                "_id": "1",
                "item_code": "ITEM-1",
                "barcode": "100",
                "item_name": "Widget",
            },
        ]
    )
    assert len(identities) == 1
    assert identities[0].source_record_ids == ["1", "2"]
    assert {alias.normalized_value for alias in identities[0].aliases} == {
        "ITEM-1",
        "100",
        "200",
    }


def test_merge_quarantines_ambiguous_aliases_without_merging_products():
    identities = merge_identities(
        [
            {"_id": "1", "item_code": "A", "barcode": "100"},
            {"_id": "2", "item_code": "B", "barcode": "100"},
            {"_id": "3", "item_code": "C", "barcode": "200"},
        ],
        quarantined_aliases={"100"},
    )
    assert len(identities) == 3
    affected = [
        identity for identity in identities if identity.normalized_code in {"A", "B"}
    ]
    unaffected = next(
        identity for identity in identities if identity.normalized_code == "C"
    )
    assert all(
        identity.collision_state == "ALIAS_QUARANTINED" for identity in affected
    )
    assert unaffected.collision_state is None
    assert all(
        "100" not in {alias.normalized_value for alias in identity.aliases}
        for identity in identities
    )


@pytest.mark.asyncio
async def test_upsert_requires_governance_and_is_idempotent():
    db = MagicMock()
    db.inventory_identities.update_one = AsyncMock()
    db.audit_logs.insert_one = AsyncMock(return_value=MagicMock(inserted_id="audit-1"))
    service = InventoryIdentityService(db)
    with pytest.raises(InventoryIdentityError):
        await service.upsert({"item_code": "A"}, actor="", change_reference="CHG-1")

    first = await service.upsert(
        {"_id": "source-1", "item_code": "A", "barcode": "1"},
        actor="admin",
        change_reference="CHG-1",
    )
    second = await service.upsert(
        {"_id": "source-1", "item_code": "A", "barcode": "1"},
        actor="admin",
        change_reference="CHG-1",
    )
    assert first["id"] == second["id"]
    assert db.inventory_identities.update_one.await_count == 2
