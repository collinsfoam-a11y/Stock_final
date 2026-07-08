# ERPNext Template Arrival Procedure

**Purpose:** the exact, deterministic procedure to run the moment the ERPNext
operator actually sends templates and metadata (in response to
`docs/ERP_NEXT_OPERATOR_HANDOFF_BUNDLE.md`, the sendable request document --
see also `docs/ERP_NEXT_TEMPLATE_REQUEST.md` for internal detail/rationale).
Follow the numbered steps in order. Do not skip a step because it looks
obvious, and do not improvise a shortcut -- the stop rules exist
specifically to prevent a rushed handoff from producing a false readiness
claim.

This procedure is more mechanical/prescriptive than
`docs/ERP_NEXT_TEMPLATE_INTAKE_RUNBOOK.md` (which explains the *why* behind
each step in more depth) -- use this file when you just need to execute,
and the runbook when you need the reasoning behind a step.

Nothing in this procedure involves ERPNext API credentials, write access,
or background jobs.

---

## Procedure

### 1. Verify received files are original ERPNext exports/templates

Confirm what arrived is actually a Data Import template downloaded from
ERPNext's own UI (Data Import > select doctype > select Import Type >
Download Template) -- not a hand-built spreadsheet, not a copy of Stock
Verify's own generated file, and not a template from a different ERPNext
instance/version than the one this project targets. If unsure, ask the
operator to confirm, or request the screenshot of the Data Import
template-download screen mentioned in `docs/ERP_NEXT_TEMPLATE_REQUEST.md`.

### 2. Copy files into `docs/erpnext_templates/`

Place each received file directly into this directory.

### 3. Preserve original extensions: `.csv` or `.xlsx`

Keep whichever format ERPNext actually produced. Do not convert CSV to
XLSX or vice versa.

### 4. Do not manually rename headers

The column headers inside the file must remain byte-for-byte what ERPNext
generated. If a header looks wrong or unexpected, that is itself a finding
to record during comparison (step 10) -- not something to silently correct.

### 5. Update `docs/erpnext_templates/template_manifest.json` with real metadata

Replace every `"unknown"`/`null` placeholder with the real value received.
Never fabricate a value that wasn't actually confirmed -- leave it
`"unknown"` and let the stop rules below catch it.

### 6. Fill all Template Waiting State Gate fields

Confirm every one of the 10 blocking fields (see
`docs/BSR_REMEDIATION_STATUS.md`'s "🔒 Template Waiting State Gate" section)
has been addressed in the manifest: `erpnext_version`, `company`, the
`templates.stock_entry`/`templates.stock_reconciliation` file references,
and all six `serial_batch_gate.*` fields (`uses_serial_batch_bundle`,
`negative_serial_batch_stock_allowed`, `serial_import_path`,
`batch_import_path`, `stock_entry_child_row_import_behavior`,
`stock_reconciliation_child_row_import_behavior`).

### 7. Run `scripts/check_erpnext_template_inputs.py`

```
python scripts/check_erpnext_template_inputs.py
```

### 8. Run `scripts/check_erpnext_template_inputs.py --json`

```
python scripts/check_erpnext_template_inputs.py --json
```

Confirm both modes agree with each other (same `ready` /
`can_advance_to_manual_import_dry_run` value).

### 9. If `can_advance_to_manual_import_dry_run=false`, stop and report missing items

Do not proceed to comparison. Report exactly which blocking items are
still missing (the script's `Blocking:` list / JSON `blocking` array tells
you this directly) and go back to the operator for whatever's outstanding.
**This is a normal, expected outcome if the operator's response was
partial -- it is not a failure of this procedure.**

### 10. If true, run template comparison

Use `ErpNextTemplateValidationService` (directly, or via
`GET /api/erpnext-exports/{export_id}/validate/{file_slug}` against a real
approved preview) for each of the 8 generated file/format combinations
(stock-entry, stock-reconciliation, serials, batches x csv, xlsx). See
`docs/ERP_NEXT_TEMPLATE_COMPARISON_CHECKLIST.md` for the exact step-by-step
execution checklist for this part.

### 11. Save the comparison result

Copy `docs/ERP_NEXT_TEMPLATE_COMPARISON_RESULT_TEMPLATE.md` to a new dated
file (e.g. `docs/ERP_NEXT_TEMPLATE_COMPARISON_RESULT_2026-07-10.md`) and
fill in every section with the real results.

### 12. Update `docs/BSR_REMEDIATION_STATUS.md`

Add a new dated Step entry summarizing what was received and what the
comparison found. Update Section 1 (current overall status), the Template
Waiting State Gate section (mark which blocking inputs are now resolved),
Section 5 (open gaps), and Section 9 (next steps).

### 13. Update `docs/BSR_ERPNEXT_DRYRUN_REPORT.md`

Add a dated addendum following the existing pattern (Steps 10-15). Do not
overwrite or delete historical desk-review findings.

### 14. Decide whether status becomes `READY_FOR_MANUAL_IMPORT_DRY_RUN`

Apply the decision rules in `docs/ERP_NEXT_TEMPLATE_INTAKE_RUNBOOK.md`'s
"Status Decision Rules" section exactly. Do not round up. If template
comparison reveals a material incompatibility that can't be resolved by any
of the 4 mismatch categories (generator change / alias mapping / operator
instruction / business acceptance), downgrade to `NOT_READY_FOR_MANUAL_IMPORT`
instead and document exactly what would need to change.

---

## Stop Rules

Stop the procedure immediately (do not proceed further, do not claim any
readiness upgrade) if any of the following is true:

- **ERPNext version is missing.**
- **Company is missing.**
- **Stock Entry or Stock Reconciliation template is missing.**
- **Serial/Batch Bundle status is unknown.**
- **Stock Entry / Stock Reconciliation child-row behavior is unknown.**
- **Generated files miss mandatory ERPNext template columns** (a `FAIL`
  result from `ErpNextTemplateValidationService`, not merely a warning-level
  extra-column difference).

If a stop rule triggers partway through (e.g. after step 10's comparison
reveals a missing mandatory column), record what was found so far, note
exactly which stop rule triggered, and keep the status at
`READY_FOR_ERP_TEMPLATE_COMPARISON` (or downgrade to
`NOT_READY_FOR_MANUAL_IMPORT` if the incompatibility is material -- see
step 14).
