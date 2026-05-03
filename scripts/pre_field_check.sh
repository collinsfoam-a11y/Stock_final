#!/bin/bash
set -e

echo "🚀 Running full pre-field validation..."

bash scripts/release_freeze.sh
node scripts/console_check.js

echo "✅ SYSTEM READY FOR FIELD TEST"
