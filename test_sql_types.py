import os
import asyncio
from dotenv import load_dotenv

load_dotenv("backend/.env")

from backend.sql_server_connector import SQLServerConnector

async def main():
    connector = SQLServerConnector()
    connector.connect()
    items = connector.get_all_items()
    if items:
        item = items[0]
        print("SQL item_code:", repr(item.get("item_code")), type(item.get("item_code")))
    else:
        print("No items")
    connector.close()

asyncio.run(main())
