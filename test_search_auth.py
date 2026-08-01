import asyncio
import httpx
import json

async def test_search():
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8001") as client:
        # Login
        print("Logging in...")
        login_res = await client.post(
            "/api/auth/login",
            json={"username": "staff1", "password": "pass123"}
        )
        if login_res.status_code != 200:
            print(f"Login failed: {login_res.status_code} {login_res.text}")
            return
        
        token = login_res.json()["data"]["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test semantic search
        print("\nTesting semantic search (/api/v2/items/semantic)...")
        r = await client.get("/api/v2/items/semantic", params={"query": "test item", "limit": 2}, headers=headers)
        print(f"Status: {r.status_code}")
        print(json.dumps(r.json(), indent=2))

        # Test optimized search
        print("\nTesting optimized search (/api/items/search/optimized)...")
        r = await client.get("/api/items/search/optimized", params={"q": "test", "limit": 2}, headers=headers)
        print(f"Status: {r.status_code}")
        print(json.dumps(r.json(), indent=2))

if __name__ == "__main__":
    asyncio.run(test_search())
