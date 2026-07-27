#!/bin/bash
set -euo pipefail

echo "Running agent CI..."
cd backend && python -m ruff check . && python -m ruff format --check .
cd frontend && corepack pnpm run lint
cd frontend && corepack pnpm run typecheck
cd backend && python -m pytest backend/tests/ -q --tb=short
cd frontend && corepack pnpm test -- --runInBand
