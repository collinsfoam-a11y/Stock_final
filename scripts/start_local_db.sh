#!/bin/bash
# Start Local MongoDB using backend/data/db

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$PROJECT_ROOT/backend/data/db"
LOG_FILE="$PROJECT_ROOT/backend/data/mongod.log"
REPAIR_LOG="$PROJECT_ROOT/backend/data/mongod-repair.log"
MONGO_HOST="127.0.0.1"
MONGO_PORT="27017"
REPL_SET_NAME="rs0"
TRANSACTION_PROBE_DB="stock_verify"
PYTHON_SH="$PROJECT_ROOT/scripts/python.sh"

echo "🍃 Starting Local MongoDB..."
echo "   Data Directory: $DATA_DIR"
echo "   Log File: $LOG_FILE"

# Check if mongod is installed
if ! command -v mongod &> /dev/null; then
    echo "❌ mongod could not be found. Please install MongoDB Community Edition."
    exit 1
fi

mkdir -p "$DATA_DIR"

is_port_open() {
    nc -z "$MONGO_HOST" "$MONGO_PORT" 2>/dev/null
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
    mongod \
        --dbpath "$DATA_DIR" \
        --port "$MONGO_PORT" \
        --bind_ip "$MONGO_HOST" \
        --replSet "$REPL_SET_NAME" \
        --nounixsocket \
        > "$LOG_FILE" 2>&1 &
    MONGO_PID=$!
    echo "✅ MongoDB started with PID: $MONGO_PID"
    echo "   To stop it, run: kill $MONGO_PID"
}

current_replset_name() {
    MONGO_HOST="$MONGO_HOST" MONGO_PORT="$MONGO_PORT" "$PYTHON_SH" - <<'PY'
from pymongo import MongoClient
import os

host = os.environ["MONGO_HOST"]
port = int(os.environ["MONGO_PORT"])

try:
    client = MongoClient(
        host=host,
        port=port,
        serverSelectionTimeoutMS=3000,
        directConnection=True,
    )
    hello = client.admin.command("hello")
    print(hello.get("setName", ""))
except Exception:
    print("")
PY
}

wait_for_primary() {
    local max_retries="${1:-30}"
    local count=0
    while [ "$count" -lt "$max_retries" ]; do
        local writable
        writable="$(
            MONGO_HOST="$MONGO_HOST" MONGO_PORT="$MONGO_PORT" "$PYTHON_SH" - <<'PY'
from pymongo import MongoClient
import os

host = os.environ["MONGO_HOST"]
port = int(os.environ["MONGO_PORT"])

try:
    client = MongoClient(
        host=host,
        port=port,
        serverSelectionTimeoutMS=3000,
        directConnection=True,
    )
    hello = client.admin.command("hello")
    print("1" if hello.get("isWritablePrimary") else "0")
except Exception:
    print("0")
PY
        )"
        if [ "$writable" = "1" ]; then
            return 0
        fi
        sleep 1
        count=$((count + 1))
    done
    return 1
}

initialize_replica_set() {
    MONGO_HOST="$MONGO_HOST" MONGO_PORT="$MONGO_PORT" REPL_SET_NAME="$REPL_SET_NAME" "$PYTHON_SH" - <<'PY'
from pymongo import MongoClient, errors
import os
import sys

host = os.environ["MONGO_HOST"]
port = int(os.environ["MONGO_PORT"])
replset_name = os.environ["REPL_SET_NAME"]

client = MongoClient(
    host=host,
    port=port,
    serverSelectionTimeoutMS=5000,
    directConnection=True,
)

config = {
    "_id": replset_name,
    "members": [{"_id": 0, "host": f"{host}:{port}"}],
}

try:
    client.admin.command("replSetInitiate", config)
except errors.OperationFailure as exc:
    message = str(exc).lower()
    if "already initialized" in message or "already initiated" in message:
        sys.exit(0)
    if "not running with --replset" in message or "not started with replication enabled" in message:
        sys.exit(2)
    raise
PY
}

wait_for_port_closed() {
    local max_retries="${1:-30}"
    local count=0
    while [ "$count" -lt "$max_retries" ]; do
        if ! is_port_open; then
            return 0
        fi
        sleep 1
        count=$((count + 1))
    done
    return 1
}

restart_mongo_with_replset() {
    echo "♻️  Restarting local mongod with replica set mode enabled..."
    local pids
    pids="$(lsof -tiTCP:"$MONGO_PORT" -sTCP:LISTEN || true)"
    if [ -n "$pids" ]; then
        for pid in $pids; do
            kill "$pid" >/dev/null 2>&1 || true
        done
    fi

    if ! wait_for_port_closed 15; then
        echo "❌ Failed to stop existing MongoDB listener on port $MONGO_PORT."
        return 1
    fi

    start_mongo
    if ! wait_for_mongo 30; then
        echo "❌ MongoDB did not come back after restart."
        return 1
    fi
    return 0
}

ensure_replica_set() {
    local replset_name
    replset_name="$(current_replset_name)"

    if [ "$replset_name" = "$REPL_SET_NAME" ]; then
        echo "✅ Replica set '$REPL_SET_NAME' is active."
        return 0
    fi

    if [ -n "$replset_name" ] && [ "$replset_name" != "$REPL_SET_NAME" ]; then
        echo "❌ MongoDB is using replica set '$replset_name' (expected '$REPL_SET_NAME')."
        echo "   Restart mongod with --replSet $REPL_SET_NAME to match local backend settings."
        return 1
    fi

    echo "🔧 Initializing replica set '$REPL_SET_NAME'..."
    initialize_replica_set
    local init_status=$?
    if [ "$init_status" -ne 0 ]; then
        if [ "$init_status" -ne 2 ]; then
            echo "❌ Replica set initialization failed."
            return 1
        fi

        if ! restart_mongo_with_replset; then
            return 1
        fi
        if ! initialize_replica_set; then
            echo "❌ Replica set initialization failed after restart."
            return 1
        fi
    fi

    if ! wait_for_primary 30; then
        echo "❌ Replica set initialization timed out."
        return 1
    fi

    replset_name="$(current_replset_name)"
    if [ "$replset_name" != "$REPL_SET_NAME" ]; then
        echo "❌ Replica set initialization failed (found '$replset_name')."
        return 1
    fi

    echo "✅ Replica set '$REPL_SET_NAME' initialized."
}

validate_transaction_support() {
    if MONGO_HOST="$MONGO_HOST" MONGO_PORT="$MONGO_PORT" REPL_SET_NAME="$REPL_SET_NAME" TRANSACTION_PROBE_DB="$TRANSACTION_PROBE_DB" "$PYTHON_SH" - <<'PY'
from pymongo import MongoClient
import os

host = os.environ["MONGO_HOST"]
port = int(os.environ["MONGO_PORT"])
replset_name = os.environ["REPL_SET_NAME"]
db_name = os.environ["TRANSACTION_PROBE_DB"]

client = MongoClient(
    f"mongodb://{host}:{port}/?replicaSet={replset_name}",
    serverSelectionTimeoutMS=5000,
    directConnection=True,
)
session = client.start_session()
try:
    session.start_transaction()
    coll = client[db_name]["__txn_probe"]
    coll.insert_one({"probe": True}, session=session)
    session.abort_transaction()
finally:
    session.end_session()
PY
    then
        echo "✅ Transaction support validated."
        return 0
    fi

    echo "❌ Transaction probe failed."
    return 1
}

check_for_wiredtiger_issues() {
    grep -E -q "WiredTiger metadata corruption|WiredTiger.wt: handle-open: open|Please read the documentation for starting MongoDB with --repair" "$LOG_FILE"
}

# Check if already running
if pgrep -x "mongod" > /dev/null; then
    echo "⚠️  MongoDB is already running."
    if wait_for_mongo 5; then
        echo "✅ MongoDB is ready!"
        ensure_replica_set || exit 1
        validate_transaction_support || exit 1
        exit 0
    fi
    echo "❌ MongoDB process found but port $MONGO_PORT is not responding."
    exit 1
fi

start_mongo

echo "⏳ Waiting for MongoDB to be ready..."
if wait_for_mongo; then
    echo "✅ MongoDB is ready!"
    ensure_replica_set || exit 1
    validate_transaction_support || exit 1
    exit 0
fi

echo "⚠️  MongoDB started but port $MONGO_PORT is not accessible yet."
if check_for_wiredtiger_issues; then
    echo "🧰 WiredTiger issue detected. Attempting repair..."
    if [ -n "${MONGO_PID:-}" ] && ps -p "$MONGO_PID" > /dev/null 2>&1; then
        kill "$MONGO_PID" >/dev/null 2>&1 || true
        sleep 1
    fi
    if ! mongod --dbpath "$DATA_DIR" --repair --nounixsocket > "$REPAIR_LOG" 2>&1; then
        echo "❌ MongoDB repair failed. See $REPAIR_LOG for details."
        exit 1
    fi
    start_mongo
    echo "⏳ Waiting for MongoDB to be ready after repair..."
    if wait_for_mongo; then
        echo "✅ MongoDB is ready after repair!"
        ensure_replica_set || exit 1
        validate_transaction_support || exit 1
        exit 0
    fi
fi

echo "❌ MongoDB failed to start. Check $LOG_FILE for details."
exit 1
