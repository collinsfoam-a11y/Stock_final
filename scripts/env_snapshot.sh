#!/bin/bash

echo "📸 Capturing environment snapshot..."

echo "Node version:"
node -v

echo "NPM version:"
npm -v

echo "Git commit:"
git rev-parse HEAD

echo "Frontend deps hash:"
cd frontend && npm ls --depth=0 || true

echo "Backend deps:"
cd ../backend && pip freeze || true
