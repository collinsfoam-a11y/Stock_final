import asyncio
from backend.services.search_service import get_search_service
from backend.db.runtime import init_db, get_db

async def test():
    # Initialize DB properly
    await init_db()
    
    # Get service
    service = get_search_service()
    
    # Test strict search that should match exactly one or two items
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
