#!/usr/bin/env python3
"""A lightweight script to aggregate basic repository health checks."""

import sys
from pathlib import Path


project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


def check_file_exists(path: str) -> bool:
    return Path(path).exists()


def gitignore_covers_backend_env(gitignore_content: str) -> bool:
    accepted_patterns = {'.env', 'backend/.env', '**/.env'}
    patterns = {
        line.strip()
        for line in gitignore_content.splitlines()
        if line.strip() and not line.strip().startswith('#')
    }
    return any(pattern in patterns for pattern in accepted_patterns)


def main() -> None:
    print('=' * 60)
    print('Stock Verify System - Health Summary')
    print('=' * 60)

    issues: list[str] = []

    print('\n[1] Environment Security')
    if check_file_exists('backend/.env'):
        print('  [WARN] backend/.env file found.')
        if check_file_exists('.gitignore'):
            with open('.gitignore', 'r', encoding='utf-8') as file_obj:
                content = file_obj.read()
            if gitignore_covers_backend_env(content):
                print('  [OK] backend/.env is gitignored.')
            else:
                print('  [WARN] Confirm if .env is properly gitignored!')
                issues.append('Check .env gitignore status')
    else:
        print('  [OK] No backend/.env file found (Production/CI mode).')

    print('\n[2] Dependencies')
    if check_file_exists('backend/requirements.txt'):
        print('  [OK] backend/requirements.txt exists.')
    else:
        print('  [ERR] backend/requirements.txt missing!')
        issues.append('Missing backend/requirements.txt')

    if check_file_exists('frontend/package.json'):
        print('  [OK] frontend/package.json exists.')
    else:
        print('  [ERR] frontend/package.json missing!')
        issues.append('Missing frontend/package.json')

    print('\n[3] Code Quality')
    print("  [INFO] Run 'ruff check .' in backend/ for detailed linting.")
    print("  [INFO] Run 'npm run lint' in frontend/ for detailed linting.")

    print('\n' + '-' * 60)
    if issues:
        print(f'[FAIL] Found {len(issues)} potential issues:')
        for index, issue in enumerate(issues, 1):
            print(f'  {index}. {issue}')
        sys.exit(1)

    print('[OK] Basic Health Check Passed')
    sys.exit(0)


if __name__ == '__main__':
    main()
