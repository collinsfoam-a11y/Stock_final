import asyncio

from backend.sql_server_connector import SQLServerConnector


async def test():
    conn = SQLServerConnector()
    qty = await conn.get_stock_quantity("530198")
    print(f"SQL qty for 530198: {qty}")


asyncio.run(test())
