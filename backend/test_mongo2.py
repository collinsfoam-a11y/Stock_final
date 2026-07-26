from pymongo import MongoClient

client = MongoClient("mongodb://localhost:27017")
db = client["stock_app"]
item = db.erp_items.find_one(
    {"$or": [{"item_code": "530198"}, {"barcode": "530198"}]},
    {"stock_qty": 1, "sql_verified_qty": 1, "item_code": 1, "barcode": 1},
)
print("MONGO:", item)
