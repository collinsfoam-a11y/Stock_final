from backend.models.location import LocationType
from backend.scripts.migrate_location_hierarchy import (
    build_candidates,
    build_dry_run_report,
    infer_location_type,
)


def test_candidate_inference_preserves_legacy_ids():
    source = [
        {"id": "fl_ground", "warehouse_name": "Ground Floor", "zone": "showroom"},
        {"id": "wh_main", "warehouse_name": "Main Godown", "zone": "godown"},
    ]
    candidates = build_candidates(source)
    assert [candidate.legacy_id for candidate in candidates] == ["fl_ground", "wh_main"]
    assert candidates[0].location_type == LocationType.FLOOR
    assert candidates[1].location_type == LocationType.GODOWN


def test_candidate_inference_handles_other_areas():
    assert (
        infer_location_type({"id": "damage", "warehouse_name": "Damage Area"})
        == LocationType.OTHER_AREA
    )


def test_dry_run_report_never_claims_writes():
    report = build_dry_run_report(
        [{"id": "wh_main", "warehouse_name": "Main Godown", "zone": "godown"}]
    )
    assert report["mode"] == "dry-run"
    assert report["valid_candidates"] == 1
    assert report["upserted"] == 0
