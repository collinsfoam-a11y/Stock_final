# ERPNext Template Comparison Execution Checklist

Execute this checklist during step 10 of
`docs/ERP_NEXT_TEMPLATE_ARRIVAL_PROCEDURE.md` (only after the presence
check reports `can_advance_to_manual_import_dry_run=true`). Fill in the
"Result"/"Notes" columns as you go — do not mark a step done until it has
actually been run.

| Step | Command / Action | Result | Notes |
|---|---|---|---|
| 1 | Confirm templates placed under `docs/erpnext_templates/` (`ls docs/erpnext_templates/`) | | |
| 2 | Run presence check: `python scripts/check_erpnext_template_inputs.py` | | |
| 3 | Run JSON presence check: `python scripts/check_erpnext_template_inputs.py --json` | | |
| 4 | Generate an approved preview fixture (or use an existing one) via `ErpNextExportService.generate_preview()` + `approve_preview()` | | |
| 5 | Generate stock-entry CSV/XLSX via `ErpNextExportFileService.generate_file(file_type="stock_entry", file_format="csv"/"xlsx")` | | |
| 6 | Generate stock-reconciliation CSV/XLSX (`file_type="stock_reconciliation"`) | | |
| 7 | Generate serials CSV/XLSX (`file_type="serials"`) | | |
| 8 | Generate batches CSV/XLSX (`file_type="batches"`) | | |
| 9 | Compare generated headers to the real ERPNext templates via `ErpNextTemplateValidationService.validate()` for each of the 8 file/format combinations | | |
| 10 | Classify missing columns (per file type) — record in `docs/ERP_NEXT_TEMPLATE_COMPARISON_RESULT_TEMPLATE.md` Section 6 | | |
| 11 | Classify extra columns (per file type, warning vs. strict-mode fail) — Section 7 | | |
| 12 | Classify case mismatches and order mismatches — Sections 8-9 | | |
| 13 | Classify child-table ambiguity (Stock Entry/Stock Reconciliation child-row behavior) — Section 10 | | |
| 14 | Record final status decision per `docs/ERP_NEXT_TEMPLATE_INTAKE_RUNBOOK.md`'s Status Decision Rules — Section 15 of the result template | | |

After completing this checklist, continue with steps 11-14 of
`docs/ERP_NEXT_TEMPLATE_ARRIVAL_PROCEDURE.md` (save the comparison result,
update the two status docs, decide the final status).
