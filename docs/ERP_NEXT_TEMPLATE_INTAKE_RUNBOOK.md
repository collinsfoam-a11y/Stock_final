# ERPNext Template Intake Runbook

This is the exact step-by-step flow to follow **after** the ERPNext operator
sends back the templates and answers requested in
`docs/ERP_NEXT_OPERATOR_HANDOFF_BUNDLE.md` (the sendable request document --
see also `docs/ERP_NEXT_TEMPLATE_REQUEST.md` for internal detail/rationale).
Follow it in order; don't skip steps even if a shortcut looks obvious —
several of these steps exist specifically to prevent silently claiming
readiness that hasn't actually been verified.

Nothing in this runbook involves ERPNext API credentials, write access, or
background jobs. Every step is either a file copy, a manifest edit, or
running an existing read-only script/service.

---

## 1. Copy received templates into `docs/erpnext_templates/`

Place each file the operator sent exactly as received — do not rename,
re-save, or convert format. Use the filenames already referenced in
`docs/erpnext_templates/template_manifest.json`'s `templates.*.file` fields
(update those fields if the operator's actual filenames differ, or if they
sent XLSX where the scaffold assumed CSV or vice versa).

## 2. Update `docs/erpnext_templates/template_manifest.json` with real metadata

Replace every `"unknown"`/`null` placeholder with the real value the
operator provided:

- `erpnext_version`, `frappe_version`, `company`, `source_instance`,
  `downloaded_by`, `downloaded_at`
- Each `templates.*` entry: confirm `file`, `import_type`, `has_child_table`,
  `child_table_name`
- `serial_batch_gate.uses_serial_batch_bundle`,
  `negative_serial_batch_stock_allowed`, `serial_import_path`,
  `batch_import_path`

**Do not fabricate a value you don't actually have.** If the operator hasn't
answered a specific question yet, leave that field as `"unknown"` and note
it — do not guess, and do not copy a value from
`template_manifest.example.json` (that file is illustrative only).

## 3. Run the presence check

```
python scripts/check_erpnext_template_inputs.py
```

(or `--json` for machine-readable output — see Part D of the governing task
that added this flag).

## 4. If NOT READY, fix missing metadata/files

The script's `Blocking:` list tells you exactly what's still missing. Go
back to step 1 or 2, or back to the operator if an answer is genuinely still
outstanding. Do not proceed to step 5 until the script exits 0.

## 5. Run `ErpNextTemplateValidationService` comparison for all generated files

For each of the 8 file/format combinations (stock-entry, stock-reconciliation,
serials, batches x csv, xlsx), call `ErpNextTemplateValidationService.validate()`
(directly, or via `GET /api/erpnext-exports/{export_id}/validate/{file_slug}`
against a real approved preview) and record the result — `valid`, `source`
(should now read `"ERP_NEXT_TEMPLATE"`, not `"STOCK_VERIFY_INTERNAL_SPEC"`),
`missing_columns`, `extra_columns`, `case_mismatches`, `order_mismatches`.

Also run `evaluate_serial_batch_gate()` against a representative set of
serialized/batch-controlled rows to confirm the version-based gate behaves
as expected now that real target-instance metadata exists.

## 6. Record the comparison matrix

Use `docs/ERP_NEXT_TEMPLATE_COMPARISON_RESULT_TEMPLATE.md` as the fill-in
template for this — copy it to a new dated file (e.g.
`docs/ERP_NEXT_TEMPLATE_COMPARISON_RESULT_2026-07-10.md`) and complete every
section with the real results from step 5. Do not skip sections; write "N/A"
explicitly where a section genuinely doesn't apply (e.g. Serial No template
if that import path isn't used).

## 7. Classify every mismatch found

For each missing/extra/case-mismatched/order-mismatched column, classify it
into exactly one of:

- **Generator change required** — Stock Verify's own file generator
  (`erpnext_export_file_service.py`) needs a code change to match ERPNext's
  real column name/order/casing.
- **Alias/mapping allowed** — the difference can be resolved by adding a
  mapping/alias in the validation layer without changing what's actually
  exported (e.g. a case-insensitive match is acceptable to the business).
- **Operator instruction required** — the difference is fine as long as the
  human operator is told to handle it manually during import (e.g. "map
  column X to Y in ERPNext's Data Import column-mapping step").
- **Business acceptance required** — the difference is real and can't be
  resolved by any of the above; it needs an explicit, recorded sign-off from
  the business that this is acceptable to proceed with anyway.

Do not silently downgrade a real mismatch to "fine" without recording which
of these four categories it falls into.

## 8. Update `docs/BSR_REMEDIATION_STATUS.md`

Add a new dated Step entry summarizing what was received, what the
comparison found, and the resulting status decision (see the rules below).
Update Section 1 (current overall status), Section 5 (open gaps — close any
that the real templates resolved), and Section 9 (next steps).

## 9. Update `docs/BSR_ERPNEXT_DRYRUN_REPORT.md`

Add a dated addendum (following the existing pattern from Steps 10-12)
noting that real template comparison has now actually been performed, and
summarizing the result. Do not overwrite or delete the historical
desk-review findings — preserve them as evidence of what was found before
real templates existed.

## 10. Decide the final status

Apply the rules below exactly. Do not round up.

---

## Status Decision Rules

**`READY_FOR_ERP_TEMPLATE_COMPARISON`** (no change from today) if:
- Templates are still missing, or
- Version metadata is still incomplete (any of `erpnext_version`,
  `company`, `serial_batch_gate.*` still `"unknown"`)

**`READY_FOR_MANUAL_IMPORT_DRY_RUN`** only if **all** of the following hold:
- Templates are present for every required file type
- Version metadata (`erpnext_version`, `frappe_version` if available,
  `company`) is present
- Mandatory ERPNext headers are matched by the generated files, or every
  mismatch found has been formally accepted (step 7's "Business acceptance
  required" category, recorded in writing)
- The serial/batch import path (`serial_import_path`/`batch_import_path`)
  has been classified, not left `"unknown"`
- Child-table behavior (whether Stock Entry/Stock Reconciliation child rows
  can be Data-Imported directly or must be grid-pasted) is understood and
  documented

**`READY_FOR_MANUAL_ERPNEXT_IMPORT`** only if:
- A real ERPNext staging import has actually been executed using the
  generated files, and its results (accepted rows, rejected rows, any
  errors) have been recorded — no desk review or template comparison,
  however clean, substitutes for this step.

If template comparison instead reveals a **material incompatibility** (e.g.
a mandatory ERPNext column Stock Verify cannot produce at all, or a
structural mismatch that can't be resolved by any of step 7's four
categories), downgrade to `NOT_READY_FOR_MANUAL_IMPORT` and document exactly
what would need to change.
