import re

with open("backend/api/count_lines_routes.py", "r") as f:
    content = f.read()

# Import MongoUnitOfWork
content = content.replace(
    "from backend.services.transaction_manager import mongo_transaction",
    "from backend.core.uow import MongoUnitOfWork"
)

# Replace mongo_transaction(db.client) as tx:
content = content.replace(
    "async with mongo_transaction(db.client) as tx:",
    "async with MongoUnitOfWork(db.client) as uow:"
)

# Replace "db_session": tx,
content = content.replace(
    '"db_session": tx,',
    '"db_session": uow.session,'
)

with open("backend/api/count_lines_routes.py", "w") as f:
    f.write(content)
