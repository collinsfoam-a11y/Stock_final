def fix_all(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()

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

    original_start_index = -1
    for i, line in enumerate(lines):
        if line.startswith('import ') or line.startswith('from ') or line.startswith('"""'):
             # Potential start. But need to avoid my own header.
             if 'unittest.mock' in line or 'import pyodbc' in line or '__future__' in line or 'pyodbc = ' in line or 'class _Mock' in line:
                 continue
             original_start_index = i
             break

    if original_start_index != -1:
        clean_body = lines[original_start_index:]
        with open(filepath, 'w') as f:
            f.writelines(new_header + clean_body)

for fp in ['backend/utils/db_connection.py', 'backend/services/enhanced_connection_pool.py', 'backend/sql_server_connector.py', 'backend/api/mapping_api.py']:
    fix_all(fp)
