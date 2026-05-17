# Codex Codebase Audit - 2026-05-17

## Completed

- Installed GNU Make 4.4.1 for Windows and configured this shell to run repo `make` targets.
- Restored and verified `make agent-ci`.
- Restored and verified `make security`.
- Updated backend and frontend dependency security checks.
- Remediated dependency advisories:
  - `python-multipart` to `0.0.27`
  - `ujson` to `5.12.1`
  - `postcss` to `8.5.10`
- Fixed backend failures found during the audit:
  - user management password/PIN reset body handling
  - count-line projection read behavior
  - PI assistant DB-context resilience
  - static frontend fallback behavior when build artifacts disappear
  - deterministic async cache LRU behavior
  - Windows approval log file replacement
  - in-memory DB parity for projection fallback audit tests

## Contract Review Highlights

- App-side `count_lines` write mutations remain concentrated through `backend/services/count_line_write_service.py`.
- Serial uniqueness paths reviewed in backend and frontend remain item-scoped.
- CORS wildcard behavior remains limited to development/test handling.
- SQL Server paths reviewed remain read-oriented.
- Supabase tooling was available, but no Supabase source references were found and no Supabase operations were performed.

## Verification Evidence

- `make security` passed.
- `make agent-ci` passed.
- Focused route regression test passed: `backend/tests/test_routes_check.py`.
- `ruff` passed on touched backend static-serving code.

## Residual Notes

- `make security` reports that pre-commit hooks are skipped because `.pre-commit-config.yaml` is not present.
- Frontend source still contains development `console.log` calls allowed by current lint rules.
- This workspace currently reports clean git status after verification.
