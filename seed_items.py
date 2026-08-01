import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def seed():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.stock_count
    
    # Insert some items
    items = [
        {"item_code": "ITM001", "item_name": "Godrej Soaps", "barcode": "512345", "stock_qty": 10},
        {"item_code": "ITM002", "item_name": "Godrej Detergent", "barcode": "512346", "stock_qty": 20},
        {"item_code": "ITM003", "item_name": "Apple iPhone 15", "barcode": "1234567890", "stock_qty": 5},
        {"item_code": "ITM004", "item_name": "Samsung Galaxy S23", "barcode": "0987654321", "stock_qty": 15},
    ]
    
    await db.erp_items.delete_many({})
    await db.erp_items.insert_many(items)
    print("Inserted items.")

if __name__ == "__main__":
    asyncio.run(seed())
