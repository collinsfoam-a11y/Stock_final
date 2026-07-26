# ERPNext Template & Version Intake Checklist

Tracks what has actually been received from the ERPNext operator (see `docs/ERP_NEXT_TEMPLATE_REQUEST.md`) versus what is still outstanding. Update this table as each item arrives — do not mark "Received" until the actual file/answer is in hand, and do not mark "Validated" until it has actually been checked (via `scripts/check_erpnext_template_inputs.py` and/or `ErpNextTemplateValidationService`).

**Current state (2026-07-08): nothing has been received yet.** No ERPNext staging URL, credentials, templates, or version information have been provided at any point in this remediation effort.

| Item | Received | Validated | Notes |
|---|---|---|---|
| ERPNext version | No | No | |
| Frappe version | No | No | |
| Company name | No | No | |
| Stock Entry template | No | No | |
| Stock Reconciliation template | No | No | |
| Serial No template | No | No | Only required if the operator confirms the classic Serial No import path is used |
| Batch template | No | No | Only required if the operator confirms the classic Batch import path is used |
| Serial and Batch Bundle status | No | No | |
| Negative serial/batch stock rule | No | No | |
| Stock Entry child-row import behavior | No | No | Can Data Import populate child rows directly, or must they be grid-pasted? |
| Stock Reconciliation child-row import behavior | No | No | Same question as above, for Stock Reconciliation |

## Acceptance Criteria

- **Ready for comparison** (`READY_FOR_ERP_TEMPLATE_COMPARISON`) only when the required templates and version metadata above are present — this is the floor Stock Verify already sits at today using its own internal specification; real per-instance comparison requires the rows above to be filled in.
- **Ready for manual dry-run** (`READY_FOR_MANUAL_IMPORT_DRY_RUN`) only when template comparison (`ErpNextTemplateValidationService`) passes for all required file types, or any mismatches found have been formally accepted in writing by the business (not silently downgraded to a warning by code).
- **Ready for manual import** (`READY_FOR_MANUAL_ERPNEXT_IMPORT`) only after a successful real ERPNext staging import has actually been executed and its results recorded — no prior step, however clean, substitutes for this.

## How to use this checklist

1. As each item in the table above arrives, flip its "Received" column to "Yes" and note the source (e.g. "screenshot from ops, 2026-07-10") in Notes.
2. Once the corresponding template files are placed under `docs/erpnext_templates/` and the manifest (`docs/erpnext_templates/template_manifest.json`) is updated with the real values, run:
   ```
   python scripts/check_erpnext_template_inputs.py
   ```
   to confirm presence programmatically.
3. Once presence is confirmed, run `ErpNextTemplateValidationService.validate()` (via the existing `GET /api/erpnext-exports/{export_id}/validate/{file_slug}` endpoint, or directly) for each file type, and flip "Validated" to "Yes" once its result has actually been reviewed.
4. Update `docs/BSR_REMEDIATION_STATUS.md`'s overall status once all rows above are `Received: Yes` and the comparison step has completed.
