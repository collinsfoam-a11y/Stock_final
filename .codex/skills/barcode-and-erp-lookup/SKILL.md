---
name: barcode-and-erp-lookup
description: Use when changing Stock Verify barcode normalization, scan lookup, ERP item search, item verification API calls, barcode tests, or frontend scan/search behavior. Enforces the repo rule to use _normalize_barcode_input and keep ERP read-only.
---

# Barcode And ERP Lookup

Use this skill for barcode, scan, ERP lookup, item search, and item verification behavior.

## Authoritative Docs

- `AGENTS.md`
- `backend/README.md`
- `docs/STOCK_VERIFICATION_V3_UI_UX_GUIDE.md` for scan UX

## Rules

- Backend barcode normalization must use `_normalize_barcode_input` in `backend/api/erp_api.py`.
- ERP remains read-only. Never add SQL write-back during barcode or item lookup work.
- Scan lookup must not bypass governed stock write paths.
- Frontend scan/search API mapping must remain aligned in `frontend/src/services/api/api.ts`.
- Manual barcode entry must remain available when camera scanning fails.
- Duplicate serial checks remain item-scoped, never global.

## Workflow

1. Identify whether the task touches backend normalization, frontend scan UX, API mapping, or tests.
2. Read the smallest relevant files first:
   - `backend/api/erp_api.py`
   - `frontend/src/services/api/api.ts`
   - scan-related frontend files for UI behavior
3. Preserve both camera scan and manual fallback paths.
4. Keep lookup behavior read-oriented until the user explicitly asks for a governed write flow.

## Verification

Prefer focused tests:

- `./scripts/python.sh -m pytest backend/tests/test_barcode_validation.py`
- `cd frontend && npm test -- --runInBand`
- Specific frontend barcode/API tests when present

If changing scan UI, also apply `stock-ui-governance`.
