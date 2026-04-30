# Migration Conflict Resolution Log

## Merge: collins/main into codex/migration-stabilization

- `backend/sql_server_connector.py`: merged local tenacity fallback with upstream optional `pyodbc` handling. Final decision keeps `from __future__ import annotations`, avoids import-time failure when `pyodbc` is absent, and preserves retry decorator fallback when `tenacity` is absent.
- `scripts/agent_ci.sh`: no conflict markers were present after merge. Final decision keeps local Expo telemetry/HOME isolation and upstream helper function structure.
