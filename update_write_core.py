with open("backend/services/count_lines/write_core.py", "r") as f:
    content = f.read()

replacement = """        operation = str(payload.get("operation") or "").strip().lower()
        
        # Phase 6: Instantiate Repository dynamically for the request
        from backend.repositories.count_lines import CountLineRepository
        class _RequestUoW:
            def __init__(self, client, session):
                self.client = client
                self.session = session
        
        request_uow = _RequestUoW(self.db.client, db_session)
        repository = CountLineRepository(request_uow)
        collection = repository.collection
        
        kwargs = {"session": db_session} if db_session is not None else {}"""

import re
content = re.sub(
    r'        operation = str\(payload\.get\("operation"\) or ""\)\.strip\(\)\.lower\(\)\n        collection = self\.db\.count_lines\n        kwargs = {"session": db_session} if db_session is not None else {}',
    replacement,
    content
)

with open("backend/services/count_lines/write_core.py", "w") as f:
    f.write(content)
