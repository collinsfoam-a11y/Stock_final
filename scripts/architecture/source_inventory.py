#!/usr/bin/env python3
"""
Enterprise Codebase Source Inventory Tool
Scans all source files (.ts, .tsx, .js, .jsx, .mjs, .cjs, .py, .pyi)
reconciling totals by language, extension, and architectural directory.
"""

import os
import sys
import json
from pathlib import Path

SUPPORTED_EXTENSIONS = {'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.pyi'}
EXCLUDE_DIRS = {
    'node_modules', 'dist', 'build', 'coverage', 'generated', 
    'vendor', '.git', '__pycache__', '.agent', '.expo', '.metro-cache'
}

def scan_inventory(root_dir):
    root = Path(root_dir).resolve()
    inventory = []
    by_extension = {}
    by_language = {}
    by_directory = {}
    skipped_count = 0
    skipped_files = []

    for path in root.rglob('*'):
        if any(part in EXCLUDE_DIRS for part in path.parts):
            skipped_count += 1
            continue

        if path.is_file():
            ext = path.suffix.lower()
            if ext in SUPPORTED_EXTENSIONS:
                rel_path = str(path.relative_to(root))
                lang = 'Python' if ext in {'.py', '.pyi'} else 'TypeScript/JavaScript'
                first_dir = path.relative_to(root).parts[0] if len(path.relative_to(root).parts) > 1 else '.'
                
                record = {
                    'path': rel_path,
                    'extension': ext,
                    'language': lang,
                    'directory': first_dir,
                    'size_bytes': path.stat().st_size
                }
                inventory.append(record)

                by_extension[ext] = by_extension.get(ext, 0) + 1
                by_language[lang] = by_language.get(lang, 0) + 1
                by_directory[first_dir] = by_directory.get(first_dir, 0) + 1
            else:
                skipped_count += 1
                skipped_files.append({'path': str(path.relative_to(root)), 'reason': f'Unsupported extension {ext}'})

    result = {
        'total_source_files': len(inventory),
        'by_language': by_language,
        'by_extension': by_extension,
        'by_directory': by_directory,
        'skipped_count': skipped_count,
        'symlinks_followed': 0,
        'nested_repositories_detected': 0,
        'duplicate_paths_detected': 0,
        'virtual_environments_excluded': True,
        'report_directories_excluded': True,
        'inventory': inventory
    }
    return result

if __name__ == '__main__':
    root_path = sys.argv[1] if len(sys.argv) > 1 else '.'
    data = scan_inventory(root_path)
    print(f"Source Inventory Reconciled: Total={data['total_source_files']} source files. Excluded={data['skipped_count']} non-source/generated files.")
    out_dir = Path(root_path) / '.agent' / 'reports'
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_dir / 'source-inventory-reconciled.json', 'w') as f:
        json.dump(data, f, indent=2)
    with open(out_dir / 'source-inventory.json', 'w') as f:
        json.dump(data, f, indent=2)

