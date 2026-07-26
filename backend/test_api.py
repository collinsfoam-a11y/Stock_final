import asyncio

from httpx import AsyncClient


async def test():
    async with AsyncClient() as _client:
        # Assuming the backend is running on 127.0.0.1:8000
        # Wait, how to get auth token? We don't have one.
        # Let's bypass auth or just run the router function directly.
        pass


import sys

sys.path.insert(0, "/Users/noufi1/stk_final/Stock_final")


async def run_router():

    # We must mock Request.
    class MockRequest:
        def __init__(self):
            self.state = type("obj", (object,), {"tenant_id": "test"})()
            self.url = type("obj", (object,), {"path": "/api/v2/items/530198"})()

    # Actually it's easier to just fetch from Mongo directly for 530198 and see what sql_verified_qty is!
    import motor.motor_asyncio

    from backend.core.config import settings

    client = motor.motor_asyncio.AsyncIOMotorClient(settings.MONGO_URI)
    db_obj = client[settings.MONGO_DB_NAME]
    item = await db_obj.erp_items.find_one({"item_code": "530198"})
    print("MONGO stock_qty:", item.get("stock_qty"))
    print("MONGO sql_verified_qty:", item.get("sql_verified_qty"))


asyncio.run(run_router())
