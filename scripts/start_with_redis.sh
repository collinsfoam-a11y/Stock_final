#!/bin/bash

# StockVerify Startup Script with Redis
# Starts Redis and the backend server

set -e

echo "🚀 Starting StockVerify with Redis..."

# Check if Redis is installed
if ! command -v redis-server &> /dev/null; then
    echo "❌ Redis is not installed!"
    echo "Please install Redis:"
    echo "  macOS: brew install redis"
    echo "  Ubuntu: sudo apt-get install redis-server"
    exit 1
fi

# Check if Redis is running
if ! redis-cli ping &> /dev/null; then
    echo "📦 Starting Redis server..."
    redis-server --daemonize yes
    sleep 2

    if redis-cli ping &> /dev/null; then
        echo "✅ Redis started successfully"
    else
        echo "❌ Failed to start Redis"
        exit 1
    fi
else
    echo "✅ Redis is already running"
fi

# Check Redis connection
echo "🔍 Checking Redis connection..."
if redis-cli ping | grep -q "PONG"; then
    echo "✅ Redis connection OK"
else
    echo "❌ Redis connection failed"
    exit 1
fi

# Start backend
echo "🚀 Starting backend server..."
cd "$(dirname "$0")/.."
BACKEND_PORT="${BACKEND_PORT:-8001}"
./scripts/python.sh -m uvicorn backend.server:app --host 0.0.0.0 --port "$BACKEND_PORT" --reload

echo "✅ Backend started on http://localhost:${BACKEND_PORT}"
