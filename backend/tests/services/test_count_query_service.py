from backend.services.count_query_service import get_count_query_service


class _BoolExplodingDb:
    def __bool__(self) -> bool:
        raise NotImplementedError("Database objects do not implement truth value testing")


def test_get_count_query_service_does_not_bool_check_db() -> None:
    db = _BoolExplodingDb()
    service = get_count_query_service(db)
    assert service.database is db
