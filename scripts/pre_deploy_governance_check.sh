#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> [1/7] Runtime environment validation"
cd "$ROOT_DIR"
"$ROOT_DIR/scripts/python.sh" -m backend.scripts.validate_runtime_environment

echo "==> [2/7] Backend governance contract tests"
cd "$ROOT_DIR"
"$ROOT_DIR/scripts/python.sh" -m pytest \
  backend/tests/api/test_governance_api_contracts.py \
  backend/tests/api/test_idempotency_contracts.py \
  -q

echo "==> [3/7] Frontend connectivity and policy tests"
cd "$ROOT_DIR/frontend"
npm run test -- --runInBand \
  src/core/__tests__/connectivityState.test.ts \
  src/services/api/__tests__/inventoryWorkflowApi.offlineCount.test.ts \
  src/services/__tests__/sessionManagementApi.test.ts

echo "==> [4/7] Frontend lint + typecheck"
npm run lint
npm run typecheck

echo "==> [5/7] Frontend production build"
npm run build:web

echo "==> [6/7] Critical E2E (requires backend + web server availability)"
npm run e2e:critical

echo "==> [7/7] Backend+frontend compact CI"
cd "$ROOT_DIR"
make agent-ci

echo "Pre-deploy governance checks passed."
