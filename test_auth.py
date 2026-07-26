import httpx, asyncio
async def test():
    async with httpx.AsyncClient() as client:
        print("supervisor", (await client.post("http://localhost:8001/api/auth/login", json={"username": "supervisor", "password": "supervisor123"})).status_code)
        print("admin", (await client.post("http://localhost:8001/api/auth/login", json={"username": "admin", "password": "admin123"})).status_code)
asyncio.run(test())
