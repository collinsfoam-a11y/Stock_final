import asyncio

from backend.api.v2.items import get_item_details
from backend.db.runtime import init_db


class MockResponse:
    def __init__(self):
        self.headers = {}


async def test():
    await init_db()
    resp = MockResponse()
    res = await get_item_details("530198", resp, verify_sql=True, current_user={"username": "test"})
    print(res.dict())


asyncio.run(test())
