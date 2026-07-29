import ast

def make_facade(filepath, class_name, mixin_imports, new_class_definition):
    with open(filepath, 'r') as f:
        source = f.read()

    tree = ast.parse(source)
    lines = source.splitlines()
    
    class_node = None
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            class_node = node
            break
            
    if not class_node:
        print(f"Class {class_name} not found in {filepath}")
        return
        
    # Delete all methods in the class
    methods_to_delete = []
    for item in class_node.body:
        if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
            methods_to_delete.append(item)
            
    methods_to_delete.sort(key=lambda x: x.lineno, reverse=True)
    
    for method in methods_to_delete:
        start_line = method.lineno - 1
        if method.decorator_list:
            start_line = method.decorator_list[0].lineno - 1
        end_line = method.end_lineno
        del lines[start_line:end_line]
        
    # Now replace the class definition line with the new class definition
    class_def_line = class_node.lineno - 1
    # We will replace from class_def_line down to where the methods were (which is now just the docstring)
    # Actually, the safest way is to just replace the class_def_line with our imports and new class def,
    # and then add a `pass` because the docstring is still there.
    lines[class_def_line] = mixin_imports + "\n" + new_class_definition
    
    with open(filepath, 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print(f"Patched {filepath}")

count_line_imports = """
from backend.services.count_lines.validation import CountLineValidationMixin
from backend.services.count_lines.governance import CountLineGovernanceMixin
from backend.services.count_lines.session_aggregator import CountLineSessionAggregatorMixin
from backend.services.count_lines.observation import CountObservationMixin
from backend.services.count_lines.write_core import CountLineWriteCoreMixin
"""
count_line_class = """class CountLineWriteService(
    CountLineValidationMixin,
    CountLineGovernanceMixin,
    CountLineSessionAggregatorMixin,
    CountObservationMixin,
    CountLineWriteCoreMixin
):"""

make_facade("backend/services/count_line_write_service.py", "CountLineWriteService", count_line_imports, count_line_class)

sql_sync_imports = """
from backend.services.sync.scheduler import SQLSyncSchedulerMixin
from backend.services.sync.discovery import SQLSyncDiscoveryMixin
from backend.services.sync.nightly import SQLSyncNightlyMixin
from backend.services.sync.realtime import SQLSyncRealtimeMixin
from backend.services.sync.core_sync import SQLSyncCoreSyncMixin
"""
sql_sync_class = """class SQLSyncService(
    SQLSyncSchedulerMixin,
    SQLSyncDiscoveryMixin,
    SQLSyncNightlyMixin,
    SQLSyncRealtimeMixin,
    SQLSyncCoreSyncMixin
):"""

make_facade("backend/services/sql_sync_service.py", "SQLSyncService", sql_sync_imports, sql_sync_class)
