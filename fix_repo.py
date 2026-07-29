with open("backend/repositories/base.py", "r") as f:
    content = f.read()

import re
replacement = """    @property
    def collection(self):
        from backend.config import settings
        # In tests, self.uow.client might be an InMemoryDatabase (acting as DB)
        # In prod, self.uow.client might be an AsyncIOMotorClient
        client = self.uow.client
        if hasattr(client, "__getitem__"):
            try:
                db = client[settings.DB_NAME]
                return db[self.collection_name]
            except TypeError:
                pass
        
        # Fallback for InMemoryDatabase or if client is already a DB
        return getattr(client, self.collection_name)"""

content = re.sub(
    r'    @property\n    def collection\(self\):\n(?:.*\n)*?        return self\.uow\.client\[settings\.DB_NAME\]\[self\.collection_name\]',
    replacement,
    content
)

with open("backend/repositories/base.py", "w") as f:
    f.write(content)
