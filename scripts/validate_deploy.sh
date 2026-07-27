#!/bin/bash
set -euo pipefail

if [ ! -f .env.prod ]; then
    echo "❌ .env.prod not found. Copy .env.production.example to .env.prod first."
    exit 1
fi

while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" =~ ^[A-Z][A-Z0-9_]*= ]]; then
        key="${line%%=*}"
        value="${line#*=}"
        value="${value%$'\r'}"
        if [ -z "$value" ]; then
            echo "❌ Empty value for $key"
            exit 1
        fi
        echo "✅ $key"
    fi
done < .env.prod

echo "✅ Deployment validation passed"
