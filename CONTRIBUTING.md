# Contributing

## Project Layout

- `backend/`: FastAPI backend
- `frontend/`: Expo + React Native frontend
- `scripts/`: repo automation and hygiene checks

## Requirements

- Python 3.11 (recommended; CI uses 3.11)
- Node.js (see `frontend/package.json` `engines.node`)
- pnpm (CI uses pnpm)

## Quick Start

- Install dependencies:
  - Backend: `python -m pip install -r backend/requirements.dev.txt`
  - Frontend: `cd frontend && pnpm install --frozen-lockfile`
- Run quality checks:
  - `make ci`
- Run services:
  - `make start` (or `make backend` / `make frontend`)

## Code Standards

- Python
  - Lint/format: Ruff + Black (see `make python-lint` / `make python-format`)
  - Typecheck: mypy (non-blocking by default; strict target available)
- Frontend
  - Lint: `pnpm -C frontend run lint`
  - Typecheck: `pnpm -C frontend run typecheck`
  - Format: Prettier

## Pre-Commit Hooks

This repository uses pre-commit hooks to keep changes consistent.

- Install: `python -m pip install pre-commit && pre-commit install`
- Run on all files: `make pre-commit`

## Branching & PRs

- Use small, focused PRs with a clear description and screenshots for UI changes.
- Keep PRs mergeable: update from `main`/`develop` as needed and resolve conflicts locally.
- Ensure `make ci` passes before requesting review.

## Commits

Use clear commit messages. Conventional Commits are recommended:

- `feat: ...`
- `fix: ...`
- `chore: ...`
- `docs: ...`

## Security

Do not commit secrets. Use `.env.example` templates and keep real `.env` files untracked.

If you believe you have found a security vulnerability, follow [SECURITY.md](file:///workspace/SECURITY.md).

