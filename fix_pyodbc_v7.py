def fix_all(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    import re
    # Strip everything until actual file content
    content = re.sub(r'^.*?import logging', 'import logging', content, flags=re.DOTALL)
    content = re.sub(r'^.*?import base64', 'import base64', content, flags=re.DOTALL)

    new_header = [
        'from __future__ import annotations\n',
        'import unittest.mock\n',
        'try:\n',
        '    import pyodbc\n',
        'except ImportError:\n',
        '    pyodbc = unittest.mock.MagicMock()\n',
        '    pyodbc.Error = type("Error", (Exception,), {})\n',
        '    pyodbc.Connection = type("Connection", (), {})\n\n'
    ]

    with open(filepath, 'w') as f:
        f.write("".join(new_header) + content.strip() + "\n")

for fp in ['backend/utils/db_connection.py', 'backend/services/enhanced_connection_pool.py', 'backend/sql_server_connector.py', 'backend/api/mapping_api.py']:
    fix_all(fp)
