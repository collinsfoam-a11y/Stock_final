#!/usr/bin/env python3
"""
Enterprise Architecture Boundary & Platform Leakage Checker
Enforces zero platform leakage in frontend/packages/shared and packages/core.
Checks imports, require calls, and global identifier usages.
"""

import sys
import json
from pathlib import Path

FORBIDDEN_PATTERNS = {
    "react-native": "React Native core library",
    "expo-": "Expo platform SDKs",
    "window": "Browser DOM window global",
    "document": "Browser DOM document global",
    "navigator": "Browser DOM navigator global",
    "localStorage": "Browser localStorage API",
    "sessionStorage": "Browser sessionStorage API",
    "indexedDB": "Browser IndexedDB API",
    "serviceWorker": "Browser ServiceWorker API",
    "expo-sqlite": "Expo SQLite Native Engine",
    "expo-secure-store": "Expo SecureStore Native Engine",
    "react-native-async-storage": "AsyncStorage Native Engine",
    "expo-camera": "Expo Camera Hardware Engine",
    "fs": "Node FileSystem API",
    "child_process": "Node ChildProcess API",
    "fastapi": "Backend FastAPI framework",
    "mongodb": "Backend MongoDB client",
    "redis": "Backend Redis client",
}

def scan_boundary_leakage(root_dir):
    root = Path(root_dir).resolve()
    shared_dirs = [
        root / 'frontend' / 'packages' / 'shared',
        root / 'frontend' / 'packages' / 'core',
        root / 'packages' / 'shared',
    ]

    violations = []
    files_checked = 0

    for s_dir in shared_dirs:
        if not s_dir.exists():
            continue
        for path in s_dir.rglob('*'):
            if path.is_file() and path.suffix.lower() in {'.ts', '.tsx', '.js', '.jsx'}:
                files_checked += 1
                try:
                    lines = path.read_text(encoding='utf-8', errors='ignore').splitlines()
                    for idx, line in enumerate(lines, 1):
                        stripped = line.strip()
                        if stripped.startswith('//') or stripped.startswith('/*'):
                            continue
                        for pattern, reason in FORBIDDEN_PATTERNS.items():
                            if pattern in line and ('import' in line or 'require' in line or 'window' in line or 'document' in line):
                                violations.append({
                                    'file': str(path.relative_to(root)),
                                    'line': idx,
                                    'column': line.find(pattern) + 1,
                                    'symbol': pattern,
                                    'rule': f'No {reason} in shared/core packages',
                                    'severity': 'CRITICAL',
                                    'suggested_fix': f'Extract {pattern} interaction into platform infra layer interface'
                                })
                except Exception as e:
                    print(f"Error reading {path}: {e}")

    report = {
        'files_checked': files_checked,
        'violations_found': len(violations),
        'suppressions': 0,
        'violations': violations
    }

    out_dir = root / '.agent' / 'reports'
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_dir / 'boundary-violations.json', 'w') as f:
        json.dump(report, f, indent=2)

    return report

if __name__ == '__main__':
    root = sys.argv[1] if len(sys.argv) > 1 else '.'
    report = scan_boundary_leakage(root)
    print(f"Boundary scan complete: {report['files_checked']} files checked, {report['violations_found']} violations found.")
    if report['violations_found'] > 0:
        print("❌ Boundary leakage detected!")
        sys.exit(1)
    else:
        print("✅ Boundary leakage check passed with 0 violations!")
        sys.exit(0)
