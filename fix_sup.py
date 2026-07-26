from pymongo import MongoClient
client = MongoClient("mongodb://127.0.0.1:27017")
db = client.stock_verification
admin = db.users.find_one({"username": "admin"})
print(admin.keys())
hashed = admin.get("password") or admin.get("hashed_password") or admin.get("password_hash")
db.users.update_one({"username": "supervisor"}, {"$set": {"password": hashed, "hashed_password": hashed}})
print("Updated supervisor password")
