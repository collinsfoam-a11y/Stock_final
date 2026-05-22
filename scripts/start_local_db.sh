#!/bin/bash
# Start Local MongoDB using backend/data/db

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$PROJECT_ROOT/backend/data/db"
LOG_FILE="$PROJECT_ROOT/backend/data/mongod.log"
REPAIR_LOG="$PROJECT_ROOT/backend/data/mongod-repair.log"
MONGO_HOST="127.0.0.1"
MONGO_PORT="27017"
BUNDLED_MONGOD="$PROJECT_ROOT/.runtime/mongodb-7.0.15/mongodb-win32-x86_64-windows-7.0.15/bin/mongod.exe"

resolve_mongod() {
    local candidate="${MONGOD_BIN:-}"

    if [ -n "$candidate" ] && [ -x "$candidate" ] && "$candidate" --version >/dev/null 2>&1; then
        printf '%s\n' "$candidate"
        return 0
    fi

    if command -v mongod >/dev/null 2>&1; then
        candidate="$(command -v mongod)"
        if "$candidate" --version >/dev/null 2>&1; then
            printf '%s\n' "$candidate"
            return 0
        fi
    fi

    if [ -x "$BUNDLED_MONGOD" ] && "$BUNDLED_MONGOD" --version >/dev/null 2>&1; then
        printf '%s\n' "$BUNDLED_MONGOD"
        return 0
    fi

    return 1
}

echo "🍃 Starting Local MongoDB..."
echo "   Data Directory: $DATA_DIR"
echo "   Log File: $LOG_FILE"

if ! MONGOD_BIN="$(resolve_mongod)"; then
    echo "❌ mongod could not be found. Please install MongoDB Community Edition or restore $BUNDLED_MONGOD."
    exit 1
fi
echo "   MongoDB Binary: $MONGOD_BIN"

mkdir -p "$DATA_DIR"

is_port_open() {
    if command -v nc >/dev/null 2>&1; then
        nc -z "$MONGO_HOST" "$MONGO_PORT" 2>/dev/null
        return $?
    fi

    (echo >"/dev/tcp/$MONGO_HOST/$MONGO_PORT") >/dev/null 2>&1
}

append_unix_socket_flag() {
    case "$MONGOD_BIN" in
        *.exe | *.EXE) ;;
        *) printf '%s\n' "--nounixsocket" ;;
    esac
}

wait_for_mongo() {
    local max_retries="${1:-30}"
    local count=0
    while [ "$count" -lt "$max_retries" ]; do
        if is_port_open; then
            return 0
        fi
        sleep 1
        count=$((count + 1))
    done
    return 1
}

start_mongo() {
    local -a args=(
        --dbpath "$DATA_DIR"
        --port "$MONGO_PORT"
        --bind_ip "$MONGO_HOST"
    )
    local unix_socket_flag
    unix_socket_flag="$(append_unix_socket_flag)"
    if [ -n "$unix_socket_flag" ]; then
        args+=("$unix_socket_flag")
    fi

    "$MONGOD_BIN" "${args[@]}" > "$LOG_FILE" 2>&1 &
    MONGO_PID=$!
    echo "✅ MongoDB started with PID: $MONGO_PID"
    echo "   To stop it, run: kill $MONGO_PID"
}

check_for_wiredtiger_issues() {
    grep -E -q "WiredTiger metadata corruption|WiredTiger.wt: handle-open: open|Please read the documentation for starting MongoDB with --repair" "$LOG_FILE"
}

# Check if already running. Prefer the port check because pgrep is not
# available in some Windows Git Bash/MSYS environments.
if is_port_open; then
    echo "✅ MongoDB is already listening on $MONGO_HOST:$MONGO_PORT."
    exit 0
fi

if command -v pgrep >/dev/null 2>&1 && pgrep -x "mongod" > /dev/null; then
    echo "⚠️  MongoDB is already running."
    if wait_for_mongo 5; then
        echo "✅ MongoDB is ready!"
        exit 0
    fi
    echo "❌ MongoDB process found but port $MONGO_PORT is not responding."
    exit 1
fi

start_mongo

echo "⏳ Waiting for MongoDB to be ready..."
if wait_for_mongo; then
    echo "✅ MongoDB is ready!"
    exit 0
fi

echo "⚠️  MongoDB started but port $MONGO_PORT is not accessible yet."
if check_for_wiredtiger_issues; then
    echo "🧰 WiredTiger issue detected. Attempting repair..."
    if [ -n "${MONGO_PID:-}" ] && ps -p "$MONGO_PID" > /dev/null 2>&1; then
        kill "$MONGO_PID" >/dev/null 2>&1 || true
        sleep 1
    fi
    repair_args=(--dbpath "$DATA_DIR" --repair)
    unix_socket_flag="$(append_unix_socket_flag)"
    if [ -n "$unix_socket_flag" ]; then
        repair_args+=("$unix_socket_flag")
    fi
    if ! "$MONGOD_BIN" "${repair_args[@]}" > "$REPAIR_LOG" 2>&1; then
        echo "❌ MongoDB repair failed. See $REPAIR_LOG for details."
        exit 1
    fi
    start_mongo
    echo "⏳ Waiting for MongoDB to be ready after repair..."
    if wait_for_mongo; then
        echo "✅ MongoDB is ready after repair!"
        exit 0
    fi
fi

echo "❌ MongoDB failed to start. Check $LOG_FILE for details."
exit 1
