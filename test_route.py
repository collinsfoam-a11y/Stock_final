import asyncio
from httpx import AsyncClient, ASGITransport
from backend.app.factory import create_app
app = create_app()

async def main():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/auth/logout")
        print(f"Status: {resp.status_code}")
        print(f"Body: {resp.text}")

asyncio.run(main())
