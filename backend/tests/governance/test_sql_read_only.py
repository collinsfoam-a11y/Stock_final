import pytest

from backend.sql_server_connector import DatabaseQueryError, SQLServerConnector


@pytest.mark.asyncio
@pytest.mark.governance
async def test_sql_connector_blocks_mutations():
    connector = SQLServerConnector()
    mutations = [
        "UPDATE dbo.Products SET Name = 'X' WHERE ProductID = 1",
        "INSERT INTO dbo.Products (Name) VALUES ('X')",
        "DELETE FROM dbo.Products WHERE ProductID = 1",
        "MERGE dbo.Products AS T USING dbo.Products AS S ON 1=0 WHEN MATCHED THEN UPDATE SET Name='X';",
        "DROP TABLE dbo.Products",
        "ALTER TABLE dbo.Products ADD ColumnX INT",
        "CREATE TABLE dbo.Temp (Id INT)",
    ]

    for query in mutations:
        with pytest.raises(DatabaseQueryError) as exc:
            await connector.execute_query(query)
        assert "READ_ONLY" in str(exc.value)
