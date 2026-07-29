import ast
import sys

def split_class(filepath, class_name, new_class_name, methods_to_keep):
    with open(filepath, 'r') as f:
        source = f.read()

    tree = ast.parse(source)
    
    lines = source.splitlines()
    
    # We need to find the class and delete the methods not in methods_to_keep
    class_node = None
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            class_node = node
            break
            
    if not class_node:
        print(f"Class {class_name} not found in {filepath}")
        return
        
    # Find methods to delete
    methods_to_delete = []
    for item in class_node.body:
        if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if item.name not in methods_to_keep:
                methods_to_delete.append(item)
                
    # Delete them from bottom to top so line numbers don't shift
    methods_to_delete.sort(key=lambda x: x.lineno, reverse=True)
    
    for method in methods_to_delete:
        start_line = method.lineno - 1
        # Include decorators
        if method.decorator_list:
            start_line = method.decorator_list[0].lineno - 1
            
        end_line = method.end_lineno
        del lines[start_line:end_line]
        
    # Replace class name
    class_def_line = class_node.lineno - 1
    lines[class_def_line] = lines[class_def_line].replace(f"class {class_name}", f"class {new_class_name}")
    
    with open(filepath, 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print(f"Processed {filepath}")

# For count_line_write_service.py
count_line_methods = {
    'validation': ['_run_post_write_validation', '_assert_mandatory_write_invariants', '_assert_snapshot_integrity_for_write'],
    'governance': ['evaluate_policy', '_should_apply_governance', 'evaluate_new_count_line', 'evaluate_existing_count_line', 'assert_session_integrity', '_resolve_governance_mode_profile', '_evaluate_governance_for_document'],
    'session_aggregator': ['_compute_session_totals', '_update_session_totals_for_sessions', 'finalize_session_count_lines', 'archive_orphan_session_lines', '_extract_db_session', '_load_session_for_write', '_capture_session_versions', '_collect_session_ids_for_write', '_resolve_session_document'],
    'observation': ['write_count_observation', '_build_count_observation_semantic_hash'],
    'write_core': ['__init__', '_resolve_awaitable', '_execute_authorized_write', '_should_run_runtime_validation', '_log_count_line_audit', '_execute_count_line_operation', '_process_write_core', 'commit', 'process_write', '_build_count_line_projection', '_apply_state_transition_for_write', 'resolve_baseline', '_enforce_variance_for_write', '_copy_authoritative_baseline_fields', '_collect_risk_flags', '_apply_review_reset_fields', '_apply_authoritative_fields']
}

for mixin, methods in count_line_methods.items():
    filepath = f"backend/services/count_lines/{mixin}.py"
    split_class(filepath, "CountLineWriteService", f"CountLine{mixin.title().replace('_', '')}Mixin", set(methods))
    
# For sql_sync_service.py
sql_sync_methods = {
    'scheduler': ['_sync_loop', 'start', 'stop', 'enable', 'disable', 'set_interval'],
    'discovery': ['discover_new_items', '_collect_mongo_item_codes', '_create_discovered_items', '_select_new_items', '_finish_discovery_stats'],
    'nightly': ['nightly_full_sync', 'should_run_nightly_sync'],
    'realtime': ['check_item_qty_realtime', 'sync_single_item_by_barcode'],
    'core_sync': ['__init__', 'sync_variance_only', 'should_check_new_items', 'sync_quantities_only', '_sync_single_item', '_update_existing_item', '_finalize_sync_stats', '_update_sync_metadata', 'sync_now', 'sync_items', 'sync_all_items', 'get_stats']
}

for mixin, methods in sql_sync_methods.items():
    filepath = f"backend/services/sync/{mixin}.py"
    split_class(filepath, "SQLSyncService", f"SQLSync{mixin.title().replace('_', '')}Mixin", set(methods))
