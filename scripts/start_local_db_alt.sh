#!/bin/bash
# Start Local MongoDB using port 27018 and local socket path (Fallback)

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$PROJECT_ROOT/backend/data/db_alt"
LOG_FILE="$PROJECT_ROOT/backend/data/mongod_alt.log"
SOCKET_DIR="$PROJECT_ROOT/backend/data/sockets"
MONGO_HOST="127.0.0.1"
MONGO_PORT="27018"

echo "🍃 Starting Local MongoDB on port $MONGO_PORT..."
mkdir -p "$DATA_DIR"
mkdir -p "$SOCKET_DIR"

# Note: Even with --nounixsocket, some versions of mongod try to touch /tmp.
# We'll try to redirect the unix socket prefix to a directory we own.
mongod \
    --dbpath "$DATA_DIR" \
    --port "$MONGO_PORT" \
    --bind_ip "$MONGO_HOST" \
    --unixSocketPrefix "$SOCKET_DIR" \
    --nounixsocket \
    > "$LOG_FILE" 2>&1 &

MONGO_PID=$!
echo "✅ MongoDB started with PID: $MONGO_PID"
sleep 3

if nc -z "$MONGO_HOST" "$MONGO_PORT"; then
    echo "✅ MongoDB is ready on port $MONGO_PORT!"
else
    echo "❌ MongoDB failed to start on port $MONGO_PORT. Check $LOG_FILE"
    # Show last 10 lines of log
    tail -n 10 "$LOG_FILE"
    exit 1
fi
