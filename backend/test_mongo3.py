import sys

sys.path.insert(0, "/Users/noufi1/stk_final/Stock_final")
from backend.core.config import settings

print("MONGO_DB_NAME:", settings.MONGO_DB_NAME)
from pymongo import MongoClient

client = MongoClient(settings.MONGO_URI)
db = client[settings.MONGO_DB_NAME]
item = db.erp_items.find_one(
    {"$or": [{"item_code": "530198"}, {"barcode": "530198"}]},
    {"stock_qty": 1, "sql_verified_qty": 1, "item_code": 1, "barcode": 1},
)
print("MONGO:", item)
