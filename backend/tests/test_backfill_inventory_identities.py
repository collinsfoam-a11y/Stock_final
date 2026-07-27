from backend.scripts.backfill_inventory_identities import build_report


def test_dry_run_reports_valid_records_without_writes():
    report = build_report(
        [
            {"_id": "1", "item_code": "A-1", "barcode": "100"},
            {"_id": "2", "item_code": "B-1", "barcode": "200"},
        ]
    )
    assert report["mode"] == "dry-run"
    assert report["valid_identities"] == 2
    assert report["alias_collision_count"] == 0
    assert report["upserted"] == 0


def test_dry_run_blocks_shared_aliases_across_items():
    report = build_report(
        [
            {"_id": "2", "item_code": "B", "barcode": "100"},
            {"_id": "1", "item_code": "A", "barcode": "100"},
        ]
    )
    assert report["alias_collision_count"] == 1
    assert list(report["alias_collisions"]) == ["100"]


def test_dry_run_reports_missing_item_codes():
    report = build_report([{"_id": "bad", "barcode": "100"}])
    assert report["valid_identities"] == 0
    assert report["invalid_items"][0]["source_id"] == "bad"
