import asyncio
from backend.sql_server_connector import SQLServerConnector
from dotenv import load_dotenv

load_dotenv("backend/.env")

async def run():
    conn = SQLServerConnector()
    print("Testing connection...")
    if not conn.test_connection():
        print("Could not connect to SQL server")
        return
    
    print("Getting items...")
    items = conn.get_all_items()
    print(f"Retrieved {len(items)} items")
    
    seen = set()
    dups = set()
    for item in items:
        code = str(item.get("item_code", "")).strip()
        if code in seen:
            dups.add(code)
        seen.add(code)
    
    print(f"Found {len(dups)} duplicate item codes in SQL output.")
    print("Some duplicates:", list(dups)[:10])

asyncio.run(run())
