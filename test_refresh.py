import httpx
import asyncio

async def test():
    async with httpx.AsyncClient() as client:
        resp = await client.post("http://localhost:8001/api/auth/login", json={"username": "staff1", "password": "staff123"})
        data = resp.json()["data"]
        rt = data["refresh_token"]
        print("Refresh token:", rt)
        resp2 = await client.post("http://localhost:8001/api/auth/refresh", json={"refresh_token": rt})
        print("Refresh response status:", resp2.status_code)
        print("Refresh response body:", resp2.text)

asyncio.run(test())
