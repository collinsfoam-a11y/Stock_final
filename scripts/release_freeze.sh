#!/bin/bash
set -e

echo "🔒 Running release freeze checks..."

# 1. Typecheck
cd frontend
npm run -s typecheck

# 2. Lint (targeted)
npx eslint src --max-warnings=0

# 3. Governance check
cd ..
python3 backend/scripts/check_governance_static.py

# 4. Shadow enforcement check (UI runtime layer only)
if rg -q "shadow(Color|Offset|Opacity|Radius)" \
  frontend/app \
  frontend/src/components \
  frontend/src/screens \
  frontend/src/domains \
  -g "*.ts" \
  -g "*.tsx"; then
  echo "❌ Shadow props detected"
  exit 1
fi

echo "✅ Release freeze checks passed"
