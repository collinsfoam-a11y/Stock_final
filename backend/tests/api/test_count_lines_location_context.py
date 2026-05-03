from backend.api.count_lines_routes import _hydrate_count_line_location_context
from backend.api.schemas import CountLineCreate


def _build_line(**kwargs):
    return CountLineCreate(
        session_id="session-1",
        item_code="item-1",
        counted_qty=1,
        **kwargs,
    )


def test_hydrates_missing_location_fields_from_session_context():
    line = _build_line(floor_no="Ground", rack_no="A-01")
    session = {
        "location_type": "Showroom",
        "location_name": "Ground",
        "rack_no": "A-01",
    }

    _hydrate_count_line_location_context(line, session)

    assert line.location_id == "Showroom"
    assert line.floor_id == "Ground"
    assert line.rack_id == "A-01"
    assert line.floor_no == "Ground"
    assert line.rack_no == "A-01"


def test_preserves_explicit_location_ids_over_session_fallbacks():
    line = _build_line(
        location_id="LOC-EXPLICIT",
        floor_id="FLOOR-EXPLICIT",
        rack_id="RACK-EXPLICIT",
        floor_no="floor-human",
        rack_no="rack-human",
    )
    session = {
        "location_type": "Showroom",
        "location_name": "Ground",
        "rack_no": "A-01",
    }

    _hydrate_count_line_location_context(line, session)

    assert line.location_id == "LOC-EXPLICIT"
    assert line.floor_id == "FLOOR-EXPLICIT"
    assert line.rack_id == "RACK-EXPLICIT"
    assert line.floor_no == "floor-human"
    assert line.rack_no == "rack-human"
