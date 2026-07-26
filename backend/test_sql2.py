import asyncio

from backend.services.sql_verification_service import sql_verification_service


async def test():
    qty = await sql_verification_service._get_sql_quantity("530198")
    print(f"SQL qty for 530198: {qty}")


asyncio.run(test())
