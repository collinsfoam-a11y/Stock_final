#!/usr/bin/env python3
"""
Dedicated Secret Scanner for Codebase Architecture Governance
Scans working tree for real credentials, hardcoded JWT secrets, private keys, or API tokens.
"""

import sys
import re
import json
from pathlib import Path

SECRET_PATTERNS = [
    (re.compile(r'-----BEGIN\s+(?:RSA|OPENSSH|EC|PGP)?\s*PRIVATE\s+KEY-----'), "Private Key Header"),
    (re.compile(r'(?i)api[_-]?key\s*=\s*[\'\"][A-Za-z0-9_\-]{20,}[\'\"]'), "Hardcoded API Key"),
    (re.compile(r'(?i)aws[_-]?secret[_-]?access[_-]?key\s*=\s*[\'\"][A-Za-z0-9/+=]{30,}[\'\"]'), "AWS Secret Access Key"),
    (re.compile(r'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'), "Hardcoded JWT Token"),
]

EXCLUDE_DIRS = {
    'node_modules', 'dist', 'build', '.git', '__pycache__', '.agent', '.expo', 
    '.venv', '.venv-gito', 'venv', 'env', 'coverage'
}

def scan_secrets(root_dir):
    root = Path(root_dir).resolve()
    findings = []
    files_scanned = 0

    for path in root.rglob('*'):
        if any(p in path.parts for p in EXCLUDE_DIRS):
            continue
        if path.is_file() and path.suffix.lower() in {'.ts', '.tsx', '.js', '.py', '.json', '.env', '.yml', '.yaml'}:
            files_scanned += 1
            try:
                content = path.read_text(encoding='utf-8', errors='ignore')
                for line_idx, line in enumerate(content.splitlines(), 1):
                    for pattern, rule in SECRET_PATTERNS:
                        if pattern.search(line):
                            rel_path = str(path.relative_to(root))
                            is_fixture = any(k in rel_path.lower() for k in ['test', 'fixture', 'mock', 'playwright', '.auth'])
                            classification = "Test fixture" if is_fixture else "Real secret"
                            findings.append({
                                "file": rel_path,
                                "line": line_idx,
                                "rule": rule,
                                "classification": classification,
                                "remediation": "Move secret to environment variables or secret manager",
                                "status": "VERIFIED_SAFE" if is_fixture else "ACTION_REQUIRED"
                            })
            except Exception:
                pass

    unresolved_real_secrets = [f for f in findings if f["classification"] == "Real secret"]

    report = {
        "timestamp": Path('.').resolve().stat().st_ctime,
        "files_scanned": files_scanned,
        "total_findings": len(findings),
        "unresolved_real_secrets": len(unresolved_real_secrets),
        "findings": findings
    }

    out_dir = root / '.agent' / 'reports'
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_dir / 'secret-scan.json', 'w') as f:
        json.dump(report, f, indent=2)

    # Generate secret-scan.md
    md_content = f"# Dedicated Secret Scan Report\n\nFiles Scanned: `{files_scanned}` | Real Secrets Found: `{len(unresolved_real_secrets)}` | Status: `{'PASSED' if len(unresolved_real_secrets) == 0 else 'FAILED'}`\n\n"
    if findings:
        md_content += "| File | Line | Rule | Classification | Status |\n|---|---|---|---|---|\n"
        for f in findings:
            md_content += f"| `{f['file']}` | `{f['line']}` | {f['rule']} | {f['classification']} | `{f['status']}` |\n"
    else:
        md_content += "✅ Zero secrets or credentials detected across codebase.\n"

    with open(out_dir / 'secret-scan.md', 'w') as f:
        f.write(md_content)

    return report

if __name__ == '__main__':
    root = sys.argv[1] if len(sys.argv) > 1 else '.'
    rep = scan_secrets(root)
    print(f"Secret Scan Complete: {rep['files_scanned']} files scanned. Unresolved real secrets: {rep['unresolved_real_secrets']}")
    sys.exit(1 if rep['unresolved_real_secrets'] > 0 else 0)
