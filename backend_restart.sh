#!/bin/bash
kill $(lsof -t -i:8001) 2>/dev/null
ENVIRONMENT=production .venv/bin/python -m uvicorn backend.server:app --host 0.0.0.0 --port 8001 > /tmp/backend_restart_prod.log 2>&1 &
