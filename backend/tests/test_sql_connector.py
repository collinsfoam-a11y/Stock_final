from __future__ import annotations

import pytest

from backend.sql_server_connector import SQLServerConnector


@pytest.fixture
def connector() -> SQLServerConnector:
    return SQLServerConnector()


@pytest.mark.parametrize(
    "query, params",
    [
        ("SELECT * FROM dbo.Products", None),
        ("SELECT * FROM dbo.Products WHERE ProductCode = ?", ["ITEM-1"]),
        ("WITH active AS (SELECT * FROM dbo.Products) SELECT * FROM active", None),
        ("SELECT/**/1 FROM dbo.Products", None),
    ],
)
def test_read_only_queries_are_allowed(
    connector: SQLServerConnector, query: str, params: list[str] | None
) -> None:
    assert connector.is_safe_query(query, params=params)


@pytest.mark.parametrize(
    "query",
    [
        "INSERT INTO dbo.Products(ProductCode) VALUES ('ITEM-1')",
        "UPDATE dbo.Products SET ProductName = 'changed'",
        "DELETE FROM dbo.Products",
        "MERGE dbo.Products AS target USING dbo.Source AS source ON 1 = 1 WHEN MATCHED THEN UPDATE SET ProductName = 'changed'",
        "SELECT * INTO dbo.ProductsCopy FROM dbo.Products",
        "SELECT 1; DELETE FROM dbo.Products",
        "EXEC sp_executesql N'SELECT 1'",
        "SEL/* split keyword */ECT * FROM dbo.Products",
    ],
)
def test_write_and_obfuscated_queries_are_blocked(
    connector: SQLServerConnector, query: str
) -> None:
    assert not connector.is_safe_query(query)


@pytest.mark.parametrize(
    "query",
    [
        "SELECT * FROM OPENQUERY(ERP, 'SELECT * FROM dbo.Products')",
        "SELECT * FROM OPENROWSET('MSOLEDBSQL', 'Server=erp', 'SELECT 1')",
        "SELECT * FROM OPENDATASOURCE('MSOLEDBSQL', 'Data Source=erp').db.dbo.Products",
        "SELECT * FROM OPENROWSET(BULK 'payload.txt', SINGLE_CLOB) AS payload",
        "WITH delay AS (SELECT 1 AS value) SELECT * FROM delay WHERE WAITFOR = 1",
        "SELECT * FROM [ERP_LINK].[Inventory].[dbo].[Products]",
        "SELECT xp_cmdshell FROM dbo.Products",
        "SELECT sp_OACreate FROM dbo.Products",
    ],
)
def test_advanced_sql_escape_hatches_are_blocked(
    connector: SQLServerConnector, query: str
) -> None:
    assert not connector.is_safe_query(query)


def test_bound_parameters_must_match_placeholders(connector: SQLServerConnector) -> None:
    assert not connector.is_safe_query("SELECT * FROM dbo.Products", params=["ITEM-1"])
    assert not connector.is_safe_query(
        "SELECT * FROM dbo.Products WHERE ProductCode = ?", params=None
    )
    assert not connector.is_safe_query(
        "SELECT * FROM dbo.Products WHERE ProductCode = ?", params=[]
    )


@pytest.mark.integration
@pytest.mark.skip(reason="requires a live ERP login and DBA permission inspection")
def test_database_login_is_select_only() -> None:
    """Live acceptance gate: the ERP login must also be SELECT-only at the server."""

