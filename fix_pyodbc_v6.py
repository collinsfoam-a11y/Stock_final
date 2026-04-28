def fix_pool(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    import re
    # Remove mock pyodbc and restore original pyodbc usage
    content = re.sub(r'from __future__ import annotations\s*import unittest.mock\s*try:\s*import pyodbc\s*except ImportError:.*?pyodbc = _MockPyodbc\(\)\s*', '', content, flags=re.DOTALL)

    new_header = [
        'from __future__ import annotations\n',
        'import unittest.mock\n',
        'try:\n',
        '    import pyodbc\n',
        'except ImportError:\n',
        '    pyodbc = unittest.mock.MagicMock()\n',
        '    pyodbc.Error = type("Error", (Exception,), {})\n',
        '    pyodbc.Connection = type("Connection", (), {})\n'
    ]

    with open(filepath, 'w') as f:
        f.write("".join(new_header) + content.strip() + "\n")

fix_pool('backend/services/enhanced_connection_pool.py')
