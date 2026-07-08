# ERPNext Import Templates

This folder is where an operator places **real templates downloaded from the
target ERPNext instance** (Setup > Data Import > select doctype > Download
Template), so `ErpNextTemplateValidationService` can compare Stock Verify's
generated CSV/XLSX headers against what ERPNext itself actually expects --
not just Stock Verify's own internal specification.

**This folder intentionally ships with no real templates.** `template_manifest.json`
present here is a *scaffold* -- every field is explicitly `"unknown"`/`null`,
not a fabricated value -- documenting exactly what's still needed, not real
data. No real ERPNext instance was available during this phase of BSR
remediation, and inventing a template or a version number would violate this
project's "never fabricate" principle. Validation calls against this folder
today correctly return `ERP_TEMPLATE_SOURCE_MISSING` / `ERP_VERSION_UNKNOWN`
-- that is the intended, honest behavior, not a bug.

`template_manifest.example.json` (also in this folder) shows what a
**fully-completed** manifest looks like once real data has been received --
it is illustrative only, never read by `ErpNextTemplateValidationService`
(which only ever looks for the exact filename `template_manifest.json`), and
must never be copied into the real manifest as a shortcut.

## Requesting the real templates from an ERPNext operator

Send **`docs/ERP_NEXT_OPERATOR_HANDOFF_BUNDLE.md`** to the ERPNext operator
-- it is the single, self-contained, sendable version of this request (see
also `docs/ERP_NEXT_TEMPLATE_REQUEST.md` for internal detail/rationale, and
`docs/ERP_NEXT_TEMPLATE_INTAKE_CHECKLIST.md` for tracking what has and
hasn't arrived yet). Once real files/answers are received:

## What to add

1. From the target ERPNext instance, download the import template for each
   doctype you plan to import into. ERPNext may produce either CSV or XLSX
   depending on version/settings -- **keep whichever format ERPNext actually
   generated**, do not manually convert between them:
   - `stock_entry_template.csv` or `.xlsx` (doctype: Stock Entry)
   - `stock_reconciliation_template.csv` or `.xlsx` (doctype: Stock Reconciliation)
   - `serial_no_template.csv` or `.xlsx` (doctype: Serial No, only if the
     serial import path is used)
   - `batch_template.csv` or `.xlsx` (doctype: Batch, only if the batch
     import path is used)
2. Replace the placeholder values in `template_manifest.json` with the real
   ERPNext version, Frappe version, company, source instance, and
   per-template metadata (including whether the doctype has a child table)
   -- do not fabricate any value that hasn't actually been confirmed; leave
   it as `"unknown"` instead. See `template_manifest.example.json` for the
   fully-completed shape, `ErpNextTemplateValidationService`'s docstring for
   the exact schema, and
   `backend/tests/services/test_erpnext_template_validation_service.py` for
   worked examples.
3. Run `python scripts/check_erpnext_template_inputs.py` to confirm all
   required inputs are actually present before assuming they are.
4. Re-run `GET /api/erpnext-exports/{export_id}/validate/{file_slug}` (or the
   template-comparison path directly) -- results will now report `source:
   "ERP_NEXT_TEMPLATE"` instead of `"STOCK_VERIFY_INTERNAL_SPEC"`.

**`READY_FOR_MANUAL_IMPORT_DRY_RUN` cannot be claimed until real templates
are present here and the comparison above actually passes** (or any
mismatch has been formally accepted by the business, not silently
downgraded to a warning) -- see `docs/ERP_NEXT_TEMPLATE_INTAKE_CHECKLIST.md`
Acceptance Criteria and `docs/ERP_NEXT_TEMPLATE_INTAKE_RUNBOOK.md` for the
full step-by-step process once templates arrive.

See `docs/ERP_NEXT_TEMPLATE_ARRIVAL_PROCEDURE.md` for the exact, deterministic
procedure to execute the moment real templates and metadata are actually
received, and `docs/ERP_NEXT_TEMPLATE_COMPARISON_CHECKLIST.md` for the
step-by-step comparison execution checklist.

## Template File Naming Policy

Preferred filenames (used by the manifest scaffold today):

- `stock_entry_template.csv` or `.xlsx`
- `stock_reconciliation_template.csv` or `.xlsx`
- `serial_no_template.csv` or `.xlsx`
- `batch_template.csv` or `.xlsx`

**If ERPNext exports with a different filename than the preferred names
above:**

- Keep the original file exactly as received -- do not rename it in a way
  that could be mistaken for editing its content.
- Set the actual filename in `template_manifest.json`'s corresponding
  `templates.*.file` field (it doesn't have to match the preferred name
  above -- the manifest is the source of truth for which file is which).
- Only copy it to the preferred name as an *additional* convenience file if
  the copy is byte-for-byte identical to the original (e.g. `cp`, never a
  re-save through Excel/Google Sheets, which can silently alter encoding or
  formatting).
- Never edit headers, in either the original or a renamed copy.

### Checksum recommendation

Where possible, record a `sha256` hash for each received template in its
`template_manifest.json` entry:

```json
"templates": {
  "stock_entry": {
    "file": "stock_entry_template.xlsx",
    "sha256": "‹sha256 of the exact file bytes as received›",
    ...
  }
}
```

This lets `scripts/check_erpnext_template_inputs.py` (and anyone reviewing
the manifest later) verify the file on disk hasn't drifted from what was
actually received and validated. `sha256` is **optional** -- its absence is
a warning, never a hard blocker; a **mismatch**, if present, is a hard
blocker (the file on disk no longer matches what was recorded as received).
See `template_manifest.example.json` for the field shape.

## 🔒 Template Waiting State Gate

Stock Verify remains `READY_FOR_ERP_TEMPLATE_COMPARISON` until all 10
blocking inputs below are present -- see
`docs/BSR_REMEDIATION_STATUS.md`'s "🔒 Template Waiting State Gate" section
and `docs/erpnext_templates/readiness_gate.json` for the full statement of
this gate. This exists specifically so a future agent cannot accidentally
advance the status without real ERPNext evidence.

**Blocking:** ERPNext version, company name, Stock Entry template, Stock
Reconciliation template, Serial/Batch Bundle status, negative serial/batch
stock rule, serial import path, batch import path, Stock Entry child-row
import behavior, Stock Reconciliation child-row import behavior.

**Warnings only:** Frappe version, Serial No template (if used), Batch
template (if used).

### Manual verification

No automated pytest-based test pattern exists for standalone scripts in
this repo (see `scripts/` -- none of the existing check scripts have a
corresponding test file), so this script is verified by direct invocation
rather than a dedicated test file. Run:

```
python scripts/check_erpnext_template_inputs.py
python scripts/check_erpnext_template_inputs.py --json
```

**Expected result today** (nothing has been received yet): `NOT READY`,
`can_advance_to_manual_import_dry_run: false` (`NO` in human-readable
mode), exit code `1`, with all 10 blocking inputs listed above appearing in
the `Blocking:` list. This is the correct, honest state -- not a bug.

## Why this matters

Every "ERPNext import-template validation" performed by this codebase before
Step 10 (Steps 6, 7, 9) checked generated files against Stock Verify's own
independently-authored `REQUIRED_COLUMNS` spec -- never against a template
ERPNext itself produced. That is a meaningfully weaker guarantee: it proves
internal consistency, not ERPNext acceptance. See
`docs/BSR_REMEDIATION_STATUS.md` Step 9/10 and
`docs/BSR_ERPNEXT_DRYRUN_REPORT.md` for the full reasoning.
