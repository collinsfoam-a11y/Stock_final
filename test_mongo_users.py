from pymongo import MongoClient
import sys

client = MongoClient('mongodb://localhost:27017/')
db = client['e_mart_db']
users = list(db.users.find({}, {"_id": 0, "username": 1, "role": 1, "status": 1}))
print(users)
