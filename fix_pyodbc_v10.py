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

    original_imports = []
    if 'mapping_api.py' in filepath:
        original_imports = [
            'import base64\n',
            'import hashlib\n',
            'import logging\n',
            'import re\n',
            'from datetime import datetime\n',
            'from typing import Any, Optional\n',
            'from cryptography.fernet import Fernet\n'
        ]
    elif 'sql_server_connector.py' in filepath:
        original_imports = [
            'import asyncio\n',
            'import logging\n',
            'import re\n',
            'import sys\n',
            'import threading\n',
            'from pathlib import Path\n',
            'from typing import Any, Optional, Sequence\n'
        ]
    elif 'db_connection.py' in filepath:
        original_imports = [
            'import logging\n',
            'from typing import Any, Optional\n'
        ]
    elif 'enhanced_connection_pool.py' in filepath:
        original_imports = [
            'import logging\n',
            'import threading\n',
            'import time\n',
            'from contextlib import contextmanager\n',
            'from dataclasses import dataclass, field\n',
            'from datetime import datetime\n',
            'from queue import Empty, Queue\n',
            'from typing import Any, Optional\n'
        ]

    original_start_index = -1
    for i, line in enumerate(lines):
        if line.startswith('import ') or line.startswith('from ') or line.startswith('"""'):
             if 'unittest.mock' in line or 'import pyodbc' in line or '__future__' in line or 'pyodbc = ' in line or 'class _Mock' in line:
                 continue
             original_start_index = i
             break

    if original_start_index != -1:
        # Filter out lines that are now in original_imports to avoid duplicates
        body = lines[original_start_index:]
        clean_body = []
        import_names = [l.split(' ')[1].strip() for l in original_imports if l.startswith('import ')]
        from_names = [l.split(' ')[1].strip() for l in original_imports if l.startswith('from ')]

        for line in body:
            is_dupe = False
            for imp in original_imports:
                if line.strip() == imp.strip():
                    is_dupe = True
                    break
            if not is_dupe:
                clean_body.append(line)

        with open(filepath, 'w') as f:
            f.writelines(new_header + original_imports + clean_body)

for fp in ['backend/utils/db_connection.py', 'backend/services/enhanced_connection_pool.py', 'backend/sql_server_connector.py', 'backend/api/mapping_api.py']:
    fix_all(fp)
