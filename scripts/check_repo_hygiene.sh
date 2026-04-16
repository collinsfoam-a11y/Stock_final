#!/usr/bin/env bash
set -euo pipefail

# Ensure generated/runtime artifacts are not tracked in git.
BLOCKED_REGEX='^(frontend/playwright-report/|frontend/test-results/|backend/data/db_backup_[^/]+/|backend/data/db_failed_repair_[^/]+/|backend/data/db_seeded_archive_[^/]+/|backend/\.venv/|backend/venv/|\.venv/|\.mypy_cache/|\.pytest_cache/|frontend/\.expo/|frontend/node_modules/|node_modules/|backend_port\.json|frontend/public/backend_port\.json|frontend/src/backend_port\.json|\.env\.prod$|backend/\.env$|frontend/\.env$)'

# Only flag files that are both tracked and present in the working tree.
tracked_blocked="$(
  git ls-files \
    | (grep -E "$BLOCKED_REGEX" || true) \
    | while IFS= read -r path; do
        if [[ -e "$path" ]]; then
          echo "$path"
        fi
      done
)"

if [[ -n "$tracked_blocked" ]]; then
  echo "Repository hygiene check failed. Tracked artifacts detected:"
  echo "$tracked_blocked"
  echo
  echo "Remove these from git and keep them ignored."
  exit 1
fi

echo "Repository hygiene check passed."
