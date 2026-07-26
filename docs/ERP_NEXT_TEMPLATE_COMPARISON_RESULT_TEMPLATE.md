# ERPNext Template Comparison Result

**Instructions:** Copy this file to a new dated file (e.g.
`docs/ERP_NEXT_TEMPLATE_COMPARISON_RESULT_2026-07-10.md`) when real ERPNext
templates have been received and compared, per
`docs/ERP_NEXT_TEMPLATE_INTAKE_RUNBOOK.md` step 6. Fill in every section —
write "N/A" explicitly where something genuinely doesn't apply (e.g. Serial
No if that import path isn't used). Do not leave a section blank without
explanation, and do not fill in a value that wasn't actually confirmed.

**Date completed:** _____
**Completed by:** _____

---

## 1. ERPNext / Frappe Version

- ERPNext version: _____
- Frappe version: _____
- Source: (screenshot / About page / operator statement) _____

## 2. Company

- Company name (exact, as configured in ERPNext): _____

## 3. Template Source Instance

- Instance type: staging / production / unknown: _____
- Downloaded by: _____
- Downloaded at: _____

## 4. Template Files Received

| Template | Received | Format | Filename |
|---|---|---|---|
| Stock Entry | Yes/No | csv/xlsx | |
| Stock Reconciliation | Yes/No | csv/xlsx | |
| Serial No | Yes/No/N/A | csv/xlsx | |
| Batch | Yes/No/N/A | csv/xlsx | |

## 5. Generated File Comparison Matrix

| Generated File | ERPNext Template | Result | Missing Columns | Extra Columns | Case Mismatch | Order Mismatch | Action |
|---|---|---|---|---|---|---|---|
| stock-entry.csv | | Pass/Fail | | | | | |
| stock-entry.xlsx | | Pass/Fail | | | | | |
| stock-reconciliation.csv | | Pass/Fail | | | | | |
| stock-reconciliation.xlsx | | Pass/Fail | | | | | |
| serials.csv | | Pass/Fail | | | | | |
| serials.xlsx | | Pass/Fail | | | | | |
| batches.csv | | Pass/Fail | | | | | |
| batches.xlsx | | Pass/Fail | | | | | |

("Action" = one of: none / generator change required / alias mapping allowed / operator instruction required / business acceptance required — see runbook step 7.)

## 6. Missing Columns

List every column ERPNext's real template requires that Stock Verify's generated file does not produce, per file type:

- Stock Entry: _____
- Stock Reconciliation: _____
- Serial No: _____
- Batch: _____

## 7. Extra Columns

List every column Stock Verify's generated file produces that ERPNext's real template does not expect, per file type, and whether this was a warning (default) or a failure (strict mode):

- Stock Entry: _____
- Stock Reconciliation: _____
- Serial No: _____
- Batch: _____

## 8. Case Mismatches

List every column where Stock Verify's header differs from ERPNext's only by letter case:

- _____

## 9. Order Mismatches

Note whether column order differs between Stock Verify's generated files and ERPNext's real template, per file type, and whether this matters for the actual import mechanism being used (Data Import vs. grid-paste):

- _____

## 10. Child-Table Behavior Notes

- Does the real Stock Entry template support importing child (item) rows directly through Data Import, or one row per document only? _____
- Does the real Stock Reconciliation template support importing child (item) rows directly, or one row per document only? _____
- If child rows are not directly importable: is grid-paste into the Items table confirmed as the intended manual-import mechanism instead? _____

## 11. Serial and Batch Bundle Classification

| Question | Answer | Evidence | Blocking |
|---|---|---|---|
| ERPNext version? | | | |
| Uses Serial and Batch Bundle? | | | |
| Can Serial No be bulk imported directly? | | | |
| Can Batch be bulk imported directly? | | | |
| serial_import_path classification | | | |
| batch_import_path classification | | | |

## 12. Negative Serial/Batch Stock Rule

- Are negative quantities allowed for serialized/batch-controlled items on this instance? _____
- Evidence (Stock Settings screenshot, operator confirmation, or a real test transaction): _____
- Does this match or conflict with Stock Verify's `allow_negative_opening_qty` per-item flag behavior? _____

## 13. Required Stock Verify Changes

List every change (if any) that Section 5's "Action" column classified as "generator change required" or "alias mapping allowed", with the specific file/function that would need to change:

- _____

## 14. Business-Accepted Mismatches

List every mismatch formally accepted by the business as-is (not resolved by code), who accepted it, and when:

| Mismatch | Accepted By | Date | Reason |
|---|---|---|---|
| | | | |

## 15. Final Verdict

Choose one, per the rules in `docs/ERP_NEXT_TEMPLATE_INTAKE_RUNBOOK.md`:

- `READY_FOR_ERP_TEMPLATE_COMPARISON`
- `READY_FOR_MANUAL_IMPORT_DRY_RUN`
- `READY_FOR_MANUAL_ERPNEXT_IMPORT`
- `NOT_READY_FOR_MANUAL_IMPORT`

**Verdict:** _____
**Reasoning:** _____
