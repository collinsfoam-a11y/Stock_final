"""
Regression test: the Watchtower dashboard's "active sessions" and "risk
predictions" queries used to filter on status == "OPEN", a status no live
session is ever created with (sessions go CREATED -> ACTIVE). This always
returned 0 active sessions regardless of real state.
"""

from unittest.mock import AsyncMock, MagicMock, patch

from backend.api.v2.sessions import get_watchtower_stats


def _empty_aggregate_cursor():
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=[])
    return cursor


async def test_watchtower_stats_counts_active_status_sessions():
    db = MagicMock()
    db.sessions.count_documents = AsyncMock(return_value=3)
    db.sessions.find = MagicMock(return_value=MagicMock(to_list=AsyncMock(return_value=[])))
    db.count_lines.aggregate = MagicMock(return_value=_empty_aggregate_cursor())

    with patch("backend.api.v2.sessions.get_db", return_value=db):
        response = await get_watchtower_stats(current_user={"username": "admin"})

    assert response.data["active_sessions"] == 3

    count_documents_filter = db.sessions.count_documents.await_args.args[0]
    assert count_documents_filter == {"status": {"$in": ["OPEN", "ACTIVE", "RECONCILE"]}}

    find_filter = db.sessions.find.call_args.args[0]
    assert find_filter == {"status": {"$in": ["OPEN", "ACTIVE", "RECONCILE"]}}
