from unittest.mock import AsyncMock, MagicMock, patch

from backend.sql_server_connector import SQLServerConnector


def _connector_with_mock_cursor():
    connector = SQLServerConnector()
    cursor = MagicMock()
    cursor.fetchall.return_value = []
    connector.connection = MagicMock()
    connector.connection.cursor.return_value = cursor
    return connector, cursor


def test_get_item_quantities_only_uses_default_mapping():
    connector, cursor = _connector_with_mock_cursor()

    connector.get_item_quantities_only(["A1"])

    query = cursor.execute.call_args[0][0]
    assert "[Products]" in query
    assert "[ProductBatches]" in query
    assert "[ProductCode]" in query
    assert "[Stock]" in query


def test_get_item_quantities_only_uses_overridden_mapping():
    connector, cursor = _connector_with_mock_cursor()
    connector.mapping["tables"]["items"] = "CustomProducts"
    connector.mapping["items_columns"]["item_code"] = "SKU"
    connector.mapping["batch_columns"]["stock_qty"] = "OnHandQty"

    connector.get_item_quantities_only(["A1"])

    query = cursor.execute.call_args[0][0]
    assert "[CustomProducts]" in query
    assert "[SKU]" in query
    assert "[OnHandQty]" in query
    assert "[Products]" not in query


async def test_get_item_quantities_only_async_refreshes_mapping_then_runs_query():
    connector, _cursor = _connector_with_mock_cursor()

    with (
        patch.object(connector, "refresh_mapping", new=AsyncMock()) as mock_refresh,
        patch.object(connector, "get_item_quantities_only", return_value={"A1": 5.0}) as mock_sync,
    ):
        result = await connector.get_item_quantities_only_async(["A1"], db="fake-db")

    mock_refresh.assert_awaited_once_with("fake-db")
    mock_sync.assert_called_once_with(["A1"])
    assert result == {"A1": 5.0}
