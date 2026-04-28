import re

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Add from __future__ import annotations if missing
    if 'from __future__ import annotations' not in content:
        content = 'from __future__ import annotations\n' + content

    # 2. Make pyodbc optional
    content = content.replace('import pyodbc', '''import unittest.mock
try:
    import pyodbc
except ImportError:
    pyodbc = unittest.mock.MagicMock()
    pyodbc.Error = type("Error", (Exception,), {})
    pyodbc.Connection = type("Connection", (), {})''')

    # 3. Fix type hints
    content = content.replace('-> pyodbc.Connection:', '-> "pyodbc.Connection":')
    content = content.replace('conn: pyodbc.Connection', 'conn: "pyodbc.Connection"')

    with open(filepath, 'w') as f:
        f.write(content)

for fp in ['backend/utils/db_connection.py', 'backend/services/enhanced_connection_pool.py', 'backend/sql_server_connector.py', 'backend/api/mapping_api.py']:
    fix_file(fp)
