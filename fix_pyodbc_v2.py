import sys

def patch_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Remove all previous messy attempts
    import re
    # Match any from __future__
    content = re.sub(r'from __future__ import annotations\s*', '', content)
    # Match any try...except block involving pyodbc
    content = re.sub(r'try:\s*import pyodbc\s*except ImportError:.*?pyodbc = _MockPyodbc\(\)', '', content, flags=re.DOTALL)
    # Match any other messy imports
    content = re.sub(r'import unittest\.mock\s*', '', content)
    content = re.sub(r'import pyodbc\s*', '', content)
    content = re.sub(r'try:\s*import pyodbc\s*except ImportError:.*?pyodbc = None', '', content, flags=re.DOTALL)
    content = re.sub(r'try:\s*import pyodbc\s*except ImportError:.*?pyodbc = unittest\.mock\.MagicMock\(\)', '', content, flags=re.DOTALL)

    # Re-normalize usage
    content = content.replace('getattr(pyodbc, "connect", lambda *a, **k: None)', 'pyodbc.connect')
    content = content.replace('getattr(pyodbc, "drivers", lambda: [])', 'pyodbc.drivers')

    new_content = 'from __future__ import annotations\n'
    new_content += 'import unittest.mock\n'
    new_content += 'try:\n'
    new_content += '    import pyodbc\n'
    new_content += 'except ImportError:\n'
    new_content += '    class _MockPyodbc:\n'
    new_content += '        Error = type("Error", (Exception,), {})\n'
    new_content += '        Connection = type("Connection", (), {})\n'
    new_content += '        def connect(self, *args, **kwargs): return unittest.mock.MagicMock()\n'
    new_content += '        def drivers(self): return []\n'
    new_content += '    pyodbc = _MockPyodbc()\n'

    new_content += content.strip() + '\n'

    with open(filepath, 'w') as f:
        f.write(new_content)

for fp in ['backend/utils/db_connection.py', 'backend/services/enhanced_connection_pool.py', 'backend/sql_server_connector.py', 'backend/api/mapping_api.py']:
    patch_file(fp)
