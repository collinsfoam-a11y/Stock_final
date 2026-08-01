import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from backend.services.search_service import SearchService, get_search_service
from backend.db.runtime import set_db, get_db

async def test():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.stock_count
    
    # Initialize the DB manually for testing
    set_db(db)
    service = get_search_service()
    
    print("Testing query 'Godrej'...")
    res = await service.search("Godrej")
    print(f"Total: {res.total}")
    for item in res.items:
        print(f" - {item.item_name} (Score: {item.relevance_score})")
        
    print("\nTesting query '123' (partial barcode)...")
    res = await service.search("123")
    print(f"Total: {res.total}")
    for item in res.items:
        print(f" - {item.item_name} / {item.barcode} (Score: {item.relevance_score})")

if __name__ == "__main__":
    asyncio.run(test())
