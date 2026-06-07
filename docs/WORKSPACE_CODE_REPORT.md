# Workspace Code Report

Generated: 2026-06-04 16:12:27
This report inventories the workspace and summarizes key entrypoints. A literal per-line commentary for the entire repository is not practical; instead, you get full-file coverage (inventory + stats) and deeper notes on the main runtime entrypoints.
## What This Repo Is
- Primary overview: `README.md`
- Canonical architecture memory: `(missing)`
## High-Level Architecture (Observed)
- Backend: FastAPI + Motor (MongoDB).
- ERP/SQL Server: treated as read-only source of truth (via connectors/APIs).
- Frontend: React Native (Expo) with an offline-first API layer and caching.
- Frontend runtime resolves the backend via same-origin or explicit environment configuration; local tooling may still emit `backend_port.json` for development diagnostics.
## Workspace Scale
- Included files: **4436**
- Included LOC (approx, newline-based): **997419**
- Notes: build artifacts and caches are excluded (e.g., `.nx/`, `node_modules/`, virtualenvs).
## Breakdown by Top-Level Folder
| folder | files | loc | bytes |
|---|---|---|---|
| .claude | 2215 | 497891 | 18555391 |
| frontend | 727 | 150193 | 4495115 |
| backend | 472 | 116070 | 4083264 |
| .codex | 450 | 85041 | 3225806 |
| .agent | 337 | 52861 | 1649986 |
| (root) | 22 | 52124 | 2358256 |
| reports | 17 | 22643 | 2069977 |
| scripts | 118 | 11169 | 372768 |
| docs | 41 | 7211 | 281259 |
| .github | 6 | 1148 | 38425 |
| k8s | 10 | 374 | 9930 |
| agent_skills | 3 | 196 | 7105 |
| .beads | 3 | 142 | 4590 |
| monitoring | 4 | 137 | 3461 |
| .agents | 2 | 103 | 3589 |
| ios | 4 | 44 | 748 |
| nginx | 1 | 33 | 1086 |
| .Jules | 2 | 29 | 5019 |
| .husky | 1 | 9 | 160 |
| .vscode | 1 | 1 | 2 |

## Breakdown by File Type
| kind | files | loc | bytes |
|---|---|---|---|
| .json | 751 | 258956 | 11109570 |
| .py | 1068 | 238680 | 8541876 |
| .md | 939 | 178599 | 7828413 |
| .tsx | 674 | 156361 | 4686856 |
| .ts | 730 | 114342 | 3242359 |
| .yaml | 30 | 27812 | 983903 |
| .sh | 127 | 12475 | 394718 |
| .txt | 32 | 3878 | 178668 |
| .yml | 25 | 2830 | 84429 |
| .js | 26 | 1854 | 54167 |
| Makefile | 2 | 568 | 21048 |
| .example | 10 | 514 | 23084 |
| .toml | 10 | 244 | 6702 |
| Dockerfile | 6 | 224 | 7634 |
| .ini | 6 | 82 | 2510 |

## Largest Files (by LOC)
| loc | bytes | kind | path |
|---|---|---|---|
| 48892 | 2236324 | .json | collinsfoam-a11y-Stock_final-analysis-report.json |
| 48892 | 2236324 | .json | .claude/worktrees/awesome-germain-363713/collinsfoam-a11y-Stock_final-analysis-report.json |
| 13784 | 560974 | .json | reports/ui-governance-report.json |
| 13784 | 560974 | .json | .claude/worktrees/awesome-germain-363713/reports/ui-governance-report.json |
| 13192 | 474293 | .yaml | frontend/pnpm-lock.yaml |
| 13192 | 474293 | .yaml | .claude/worktrees/awesome-germain-363713/frontend/pnpm-lock.yaml |
| 5302 | 651986 | .json | reports/gito/full-codebase/code-review-report.json |
| 5302 | 651986 | .json | .claude/worktrees/awesome-germain-363713/reports/gito/full-codebase/code-review-report.json |
| 4855 | 161687 | .json | .claude/worktrees/awesome-germain-363713/.agent/reports/final-burn-test-60m-certified.json |
| 4855 | 161687 | .json | .agent/reports/final-burn-test-60m-certified.json |
| 4842 | 161399 | .json | .claude/worktrees/awesome-germain-363713/.agent/reports/final-burn-test-60m-certified-rerun.json |
| 4842 | 161399 | .json | .agent/reports/final-burn-test-60m-certified-rerun.json |
| 4350 | 98396 | .json | backend/.agent/reports/projection-parity-post-writepath-sync.json |
| 4350 | 98396 | .json | .claude/worktrees/awesome-germain-363713/backend/.agent/reports/projection-parity-post-writepath-sync.json |
| 3964 | 87399 | .json | .claude/worktrees/awesome-germain-363713/.agent/reports/post-backfill-shadow-final-summary.json |
| 3964 | 87399 | .json | .agent/reports/post-backfill-shadow-final-summary.json |
| 3952 | 87128 | .json | .claude/worktrees/awesome-germain-363713/.agent/reports/shadow-traffic-main-summary.json |
| 3952 | 87128 | .json | .agent/reports/shadow-traffic-main-summary.json |
| 3868 | 84038 | .json | .claude/worktrees/awesome-germain-363713/.agent/reports/post-backfill-shadow-summary.json |
| 3868 | 84038 | .json | .agent/reports/post-backfill-shadow-summary.json |
| 3651 | 78381 | .json | .claude/worktrees/awesome-germain-363713/.agent/reports/freeze-shadow-final-after-order-fix-summary.json |
| 3651 | 78381 | .json | .agent/reports/freeze-shadow-final-after-order-fix-summary.json |
| 2653 | 96275 | .py | backend/api/count_lines_routes.py |
| 2652 | 96240 | .py | .claude/worktrees/awesome-germain-363713/backend/api/count_lines_routes.py |
| 2567 | 93777 | .json | .claude/worktrees/awesome-germain-363713/.agent/reports/stage2-burn-15m-read-after-write-fix.json |
| 2567 | 93777 | .json | .agent/reports/stage2-burn-15m-read-after-write-fix.json |
| 2391 | 87260 | .json | .claude/worktrees/awesome-germain-363713/.agent/reports/stage2-burn-15m.json |
| 2391 | 87260 | .json | .agent/reports/stage2-burn-15m.json |
| 1872 | 65078 | .py | backend/api/session_management_api.py |
| 1872 | 65078 | .py | .claude/worktrees/awesome-germain-363713/backend/api/session_management_api.py |

## Backend Entrypoints
- `backend/main.py` not found

- Server legacy/compat entry: `backend/server.py` (large; contains wiring, services, legacy routes)

## Frontend Entrypoints
- API service layer: `frontend/src/services/api/api.ts` (offline-first, cache + retry)

## Full Inventory
A complete per-file inventory is written to `docs/WORKSPACE_CODE_INVENTORY.csv` (path, kind, bytes, loc).

## How to Regenerate
- Run: `python scripts/generate_workspace_code_report.py`
