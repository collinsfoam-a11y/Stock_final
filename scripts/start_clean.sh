#!/bin/bash
set -e

echo "🧹 Cleaning environment..."

rm -rf frontend/node_modules
rm -rf frontend/.expo
rm -rf frontend/.next

cd frontend
npm install

echo "🚀 Starting Metro..."
npm run web
