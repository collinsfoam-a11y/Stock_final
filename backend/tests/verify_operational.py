import asyncio
import os
import sys

import httpx

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from backend.config import settings

BASE_URL = f"http://localhost:{settings.PORT}"


async def verify_health_checks():
    print(f"🏥 Verifying Health Checks on {BASE_URL}...")
    async with httpx.AsyncClient() as client:
        # 1. Basic Health
        try:
            resp = await client.get(f"{BASE_URL}/health/")
            if resp.status_code == 200:
                print("✅ /health endpoint OK")
            else:
                print(f"❌ /health endpoint failed: {resp.status_code}")
                return False
        except Exception as e:
            print(f"❌ /health endpoint error: {e}")
            return False

        # 2. Detailed Health (Resource Checks)
        try:
            resp = await client.get(f"{BASE_URL}/health/detailed")
            if resp.status_code == 200:
                data = resp.json()
                resources = data.get("resources", {})
                disk = resources.get("disk", {})
                memory = resources.get("memory_mb")

                if disk and memory:
                    print("✅ /health/detailed endpoint OK")
                    print(f"   - Memory: {memory} MB")
                    print(f"   - Disk Free: {disk.get('free_gb')} GB")
                    print(f"   - Disk Status: {disk.get('status')}")
                else:
                    print(f"❌ /health/detailed missing resource info: {data.keys()}")
                    return False
            else:
                print(f"❌ /health/detailed endpoint failed: {resp.status_code}")
                return False
        except Exception as e:
            print(f"❌ /health/detailed endpoint error: {e}")
            return False

    return True


async def verify_logging_config():
    print("\n📝 Verifying Logging Configuration...")
    # We can't easily check the running server's logs from here without reading a file
    # But we can check if the config is set correctly
    print(f"   - LOG_LEVEL: {settings.LOG_LEVEL}")
    print(f"   - LOG_FORMAT: {settings.LOG_FORMAT}")

    if settings.LOG_FORMAT == "json":
        print("✅ Logging configured for JSON")
    else:
        print(f"⚠️  Logging configured for {settings.LOG_FORMAT} (expected json)")

    return True


async def main():
    print("Starting Operational Verification...")
    health_ok = await verify_health_checks()
    logging_ok = await verify_logging_config()

    if health_ok and logging_ok:
        print("\n✅ All operational checks passed!")
        sys.exit(0)
    else:
        print("\n❌ Operational checks failed!")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
