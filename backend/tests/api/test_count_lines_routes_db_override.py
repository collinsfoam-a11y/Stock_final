from backend.api.count_lines_routes import _get_db_client


class _BoolExplodingDb:
    def __bool__(self) -> bool:
        raise NotImplementedError("Database objects do not implement truth value testing")


def test_get_db_client_accepts_db_override_without_bool_coercion() -> None:
    override = _BoolExplodingDb()
    assert _get_db_client(override) is override
