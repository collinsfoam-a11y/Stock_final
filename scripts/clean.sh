#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if command -v powershell.exe >/dev/null 2>&1; then
  cd "$repo_root"
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/clean.ps1
  exit $?
fi

echo "Cleaning build artifacts..."

mapfile -d '' cache_dirs < <(
  find "$repo_root" \
    \( -path "$repo_root/.git" -o -path "$repo_root/frontend/node_modules" -o -path "$repo_root/.venv" -o -path "$repo_root/backend/.venv" \) -prune -o \
    -type d \( -name "__pycache__" -o -name ".pytest_cache" -o -name ".mypy_cache" -o -name ".hypothesis" -o -name ".ruff_cache" -o -name ".next" \) \
    -print0
)

for cache_dir in "${cache_dirs[@]}"; do
  echo "$cache_dir"
  rm -rf "$cache_dir"
done

mapfile -d '' cache_files < <(
  find "$repo_root" \
    \( -path "$repo_root/.git" -o -path "$repo_root/frontend/node_modules" -o -path "$repo_root/.venv" -o -path "$repo_root/backend/.venv" \) -prune -o \
    -type f \( -name "*.pyc" -o -name "*.pyo" \) \
    -print0
)

for cache_file in "${cache_files[@]}"; do
  echo "$cache_file"
  rm -f "$cache_file"
done

echo "Cleanup complete!"
