with open("backend/tests/api/test_count_line_occ_threading.py", "r") as f:
    content = f.read()

import re

# We replace:
# monkeypatch.setattr(clr, "mongo_transaction", _fake_tx)
# with:
# monkeypatch.setattr(clr, "MongoUnitOfWork", _fake_tx)

content = content.replace('monkeypatch.setattr(clr, "mongo_transaction", _fake_tx)',
                          'monkeypatch.setattr(clr, "MongoUnitOfWork", _fake_tx)')

content = content.replace('"""Replace mongo_transaction with a no-op async context manager."""',
                          '"""Replace MongoUnitOfWork with a no-op async context manager."""')

with open("backend/tests/api/test_count_line_occ_threading.py", "w") as f:
    f.write(content)
