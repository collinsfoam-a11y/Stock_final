from datetime import datetime

from backend.api.schemas import Session


def test_session_normalizes_empty_string_legacy_datetimes():
    session = Session(
        id="sess-legacy-datetime",
        warehouse="WH-1",
        staff_user="staff1",
        staff_name="Staff One",
        status="OPEN",
        started_at=datetime(2026, 3, 21, 10, 0, 0),
        last_heartbeat="",
        completed_at="",
        finalized_at="",
    )

    assert session.last_heartbeat is None
    assert session.completed_at is None
    assert session.finalized_at is None
