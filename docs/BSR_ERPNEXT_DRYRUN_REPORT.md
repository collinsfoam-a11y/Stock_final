# ERPNext Staging / Manual Import Dry-Run Report

**Date:** 2026-07-08
**Scope:** Static desk-review of generated CSV/XLSX export files against ERPNext's documented import-template behavior. **No live ERPNext instance was available or contacted** — this is not a substitute for a real staging import. See Section 10 for the verdict this constraint requires.

**Method:** All 10 files (5 types x 2 formats) were generated using the actual production code path (`ErpNextExportService` -> `ErpNextExportFileService` -> `ErpNextImportValidationService`), with the project's `InMemoryDatabase` test double standing in for MongoDB — the same mechanism the automated test suite already relies on. A realistic multi-item scenario was seeded (plain item, serialized item with 2 serials + a URL photo proof, batch-controlled item with a `photo_base64` inline photo, and a negative-opening-qty item) and pushed through preview -> approval -> file generation -> photo manifest -> validation. Real file bytes were inspected directly (not just described from code reading). Every finding below is labeled **VERIFIED** (confirmed by actually running the code) or **DOCUMENTED-BUT-UNCONFIRMED** (based on general ERPNext/Frappe doctype knowledge, not verified against a live instance, and possibly version-dependent).

> **Step 10 update (2026-07-08):** Both code-verified gaps below (missing DURABLE photo rows in Section 7; missing `UOM Conversion Factor` column in Section 5) have been **FIXED** — see `docs/BSR_REMEDIATION_STATUS.md` Step 10. The historical findings below are preserved unmodified as evidence of what this dry-run originally found; do not read them as still-current defects. Step 10 also added `ErpNextTemplateValidationService`, giving Section 3's "Stock Verify's own specification, not a real ERPNext template" concern a concrete resolution path — support for comparing against a real downloaded template now exists, but no real template has been supplied yet, so the underlying gap (no ERPNext-confirmed acceptance) remains open.
>
> **Step 11 update (2026-07-08):** Attempted to obtain real ERPNext templates and target-instance version metadata to close Section 3's remaining gap. **No ERPNext staging URL, credentials, or instance access were available in this environment** — nothing was fabricated. A scaffold `docs/erpnext_templates/template_manifest.json` (all fields explicitly `"unknown"`/`null`) now exists documenting exactly what's needed from the operator (see `docs/BSR_REMEDIATION_STATUS.md` Section 9, item 11's 8-point list). Re-ran the real template-comparison matrix against all 8 generated file/format combinations: all correctly report `template_available: false` and both `ERP_VERSION_UNKNOWN` + `ERP_TEMPLATE_SOURCE_MISSING`. Section 3's "Stock Verify's own specification, not a real ERPNext template" concern remains fully open — status stays `READY_FOR_ERP_TEMPLATE_COMPARISON`, not upgraded.
>
> **Step 12 update (2026-07-08):** Packaged Step 11's finding into a formal operator-facing process: `docs/ERP_NEXT_TEMPLATE_REQUEST.md` (what to send the ERPNext operator), `docs/ERP_NEXT_TEMPLATE_INTAKE_CHECKLIST.md` (tracking what's arrived), and `scripts/check_erpnext_template_inputs.py` (automated presence check, currently exits non-zero against the real manifest since nothing has arrived yet — this is expected and correctly documented, not a bug). No templates were fabricated; no code changed the underlying gap. Status remains `READY_FOR_ERP_TEMPLATE_COMPARISON`.
>
> **Step 13 update (2026-07-08):** Prepared the repository so the next agent/operator handoff can execute template comparison immediately once real templates arrive: `docs/ERP_NEXT_TEMPLATE_INTAKE_RUNBOOK.md` (exact 10-step post-arrival flow + status-decision rules) and `docs/ERP_NEXT_TEMPLATE_COMPARISON_RESULT_TEMPLATE.md` (15-section fillable result template, to be copied to a dated file once a real comparison runs). Also added `--json` output to the presence-check script. Nothing new arrived this step; no templates were fabricated. Status remains `READY_FOR_ERP_TEMPLATE_COMPARISON`. When real templates do arrive, the first artifact produced should be a dated copy of the new result template, not a new ad-hoc report.
>
> **Step 14 update (2026-07-08) — Template Waiting State Gate:** Added a hard, explicitly-labeled gate (see `docs/BSR_REMEDIATION_STATUS.md`'s "🔒 Template Waiting State Gate" section and `docs/erpnext_templates/readiness_gate.json`) so a future agent cannot accidentally advance past `READY_FOR_ERP_TEMPLATE_COMPARISON` without real ERPNext evidence. 10 blocking inputs (ERPNext version, company, Stock Entry/Stock Reconciliation templates, Serial/Batch Bundle status, negative-stock rule, serial/batch import paths, and -- newly tracked this step -- Stock Entry/Stock Reconciliation child-row import behavior) must all be present; `scripts/check_erpnext_template_inputs.py` now reports a `can_advance_to_manual_import_dry_run` field (both human-readable and `--json` modes) that is `false`/`NO` until every one of them is confirmed. No templates were received this step; nothing was fabricated. Status remains `READY_FOR_ERP_TEMPLATE_COMPARISON`.
>
> **Step 15 update (2026-07-08) — Template Arrival Procedure:** Created `docs/ERP_NEXT_TEMPLATE_ARRIVAL_PROCEDURE.md` (deterministic 14-step post-arrival execution procedure with explicit stop rules) and `docs/ERP_NEXT_TEMPLATE_COMPARISON_CHECKLIST.md` (14-row comparison sub-step checklist), so the next agent can process real templates in one deterministic pass rather than reconstructing the process. Added a template file naming policy and optional sha256 checksum verification to `scripts/check_erpnext_template_inputs.py` (mismatch is blocking; absence is a warning only) -- verified with 3 real manual scenarios (no checksum, wrong checksum, correct checksum). No templates were received this step; nothing was fabricated. Status remains `READY_FOR_ERP_TEMPLATE_COMPARISON`.
>
> **Step 16 update (2026-07-08) — ERPNext Operator Handoff Bundle:** Created `docs/ERP_NEXT_OPERATOR_HANDOFF_BUNDLE.md`, a single self-contained document meant to be sent outside the repository directly to the ERPNext operator, packaging the existing request, intake, and arrival-procedure expectations (why real templates are needed, exactly which files to download and how, the metadata/questions to answer, file handling rules, an evidence request, and a return-package checklist). Added short cross-reference pointers to it from the 4 existing operator-pack documents without duplicating their content. No templates or version metadata were received this step; nothing was fabricated. Status remains `READY_FOR_ERP_TEMPLATE_COMPARISON`.

## 1. Executive Summary

- **ERPNext staging environment:** None available. No staging URL, credentials, or live instance was provided or contacted (per product decision, no ERPNext API client exists in this codebase to contact one anyway).
- **Files tested:** 10/10 generated and inspected (stock-entry.{csv,xlsx}, stock-reconciliation.{csv,xlsx}, serials.{csv,xlsx}, batches.{csv,xlsx}, photo-manifest.{csv,xlsx})
- **Passed (Stock-Verify-side precheck):** 10/10 — `ErpNextImportValidationService.validate()` returned `valid: true`, zero errors for every file/format combination in the test scenario.
- **Passed (real ERPNext acceptance):** 0/10 — **not tested**, no live ERPNext available.
- **Manual import readiness:** Stock-Verify's own internal guarantees (immutability, hash-verification, blocker enforcement, CSV/XLSX equivalence, formula-injection safety) are solid and verified. However, this desk review surfaced concrete, code-verified gaps (missing DURABLE photo rows, missing UOM conversion factor column) plus a significant doctype-structure question for two of five file types that cannot be resolved without a real ERPNext instance.

## 2. File Acceptance Matrix

| File | Format | Accepted by ERPNext | Issues |
|---|---|---|---|
| stock-entry | csv | **NOT TESTED** | See Template Validation Matrix row 1 (child-table structure question) |
| stock-entry | xlsx | **NOT TESTED** | Same as CSV; content verified byte-identical to CSV (headers, row count, values) |
| stock-reconciliation | csv | **NOT TESTED** | See Template Validation Matrix row 1 |
| stock-reconciliation | xlsx | **NOT TESTED** | Same as CSV |
| serials | csv | **NOT TESTED** | See Template Validation Matrix row 2 (ERPNext version dependency) |
| serials | xlsx | **NOT TESTED** | Same as CSV |
| batches | csv | **NOT TESTED** | See Template Validation Matrix row 3 (`Company` column may not exist on Batch doctype) |
| batches | xlsx | **NOT TESTED** | Same as CSV |
| photo-manifest | csv | **NOT TESTED** (not an ERPNext import target at all — audit artifact only) | DURABLE inline-photo rows missing (VERIFIED, see Section 7) |
| photo-manifest | xlsx | **NOT TESTED** | Same as CSV |

File format itself (CSV/XLSX structural validity) is confirmed good: both parse cleanly with standard `csv`/`openpyxl` readers, XLSX has exactly one worksheet with a safe title, and headers/row counts/values are identical between CSV and XLSX for every file (VERIFIED by direct inspection).

## 3. Template Validation Matrix

| Rule | Stock Verify Precheck | ERPNext Result | Gap |
|---|---|---|---|
| Stock Entry / Stock Reconciliation column structure | Passes (flat columns: Company, Item Code, Warehouse, Qty, UOM, etc.) | **NOT TESTED** | **DOCUMENTED-BUT-UNCONFIRMED, potentially significant:** In ERPNext, `Stock Entry` and `Stock Reconciliation` are parent doctypes with a child table (`items`) holding `Item Code`/`Qty`/`UOM`/warehouse/rate/batch/serial fields — those fields do not exist at the top level of the parent doctype. Frappe's generic "Data Import" tool typically requires child-table columns to be specially prefixed/indexed (e.g. `Items.Item Code`) to map into the child grid; a flat one-row-per-line CSV with plain `Item Code`/`Qty` column names is unlikely to import correctly through that tool as-is. These files may still work as a direct copy-paste into the Stock Entry/Stock Reconciliation Items *grid* in the ERPNext UI (a common, legitimate manual-entry pattern that matches this flat format well) — but that is a different mechanism than the formal Data Import tool, and confirming which one the operator will actually use requires the real target instance/version. |
| Serial No import | Passes (Serial No, Item Code, Warehouse, Batch No, Company, Purchase Rate, Status) | **NOT TESTED** | **DOCUMENTED-BUT-UNCONFIRMED:** ERPNext v15+ shifted primary serial/batch tracking to "Serial and Batch Bundle"; whether bulk-importing directly into the standalone `Serial No` master doctype is still the correct/supported path depends on the target ERPNext version. Needs confirmation against the actual instance. |
| Batch import | Passes (Batch ID, Item, Manufacturing Date, Expiry Date, Company) | **NOT TESTED** | **DOCUMENTED-BUT-UNCONFIRMED:** ERPNext's core `Batch` doctype does not have a standard `Company` field in most versions reviewed from documentation. The exported `Company` column likely has no corresponding target field and may be silently ignored or rejected as unmapped, depending on the Data Import tool's strictness. Needs confirmation against the actual instance. |
| Required columns present / stable order | Passes for all 5 types (independently-specified `REQUIRED_COLUMNS` spec, not derived from the generator) | N/A (internal check only) | None found |
| Rendered file header matches expected fieldnames | Passes for all 5 types x 2 formats | N/A | None found |
| approval_hash / file_hash integrity | Passes | N/A | None found (see [BSR_REMEDIATION_STATUS.md](BSR_REMEDIATION_STATUS.md) Step 4/6 for the tests exercising tamper/mismatch cases) |

## 4. Formula Verification

| Formula | Expected | Verified |
|---|---|---|
| `erpnext_opening_qty = counted_qty` | Stock Entry `Qty` column uses counted_qty, never variance/adjustment | **VERIFIED** — plain item: counted_qty=45.0 -> Qty=45.0 (not 5.0, the variance) |
| `erpnext_adjustment_qty = counted_qty - existing_sql_qty` | Stock Reconciliation `Difference Qty` uses this, never `stock_verify_variance` (which uses baseline_qty, not existing_sql_qty) | **VERIFIED** — batch item: counted=30, current=25, Difference Qty=5.0 = 30-25, correctly independent of baseline_qty/erp_qty |
| Negative opening qty | Exported when `allow_negative_opening_qty` flag is set, blocked otherwise | **VERIFIED at Stock-Verify level** — ITM-NEG-01 (counted_qty=-2.0, flag set) exported with `Qty=-2.0` on a `Stock Entry Type: Material Receipt` row. **DOCUMENTED-BUT-UNCONFIRMED at ERPNext level:** a negative quantity on a "Material Receipt" Stock Entry type is very likely to be rejected by ERPNext's own stock-entry validation (a receipt logically cannot receive a negative quantity) — Stock-Verify's flag only controls whether *we* export it, not whether ERPNext will accept it. This needs a real ERPNext test or a product decision (e.g. route negative-opening items through a different Stock Entry Type, or exclude them from Stock Entry and rely on Stock Reconciliation only). |
| Valuation/rate handling | `Basic Rate`/`Valuation Rate`/`Purchase Rate` populated from `mrp` (documented proxy, no real `valuation_rate` field exists in this codebase) | **VERIFIED as behaving per its documented, pre-existing limitation** — not a new gap, carried over from Step 4 (see [BSR_REMEDIATION_STATUS.md](BSR_REMEDIATION_STATUS.md) Open Gaps). |

## 5. Warehouse / UOM Verification

| Field | Expected | Verified | Issue |
|---|---|---|---|
| Company | Correct, explicit company on every row | **VERIFIED** — `Acme Retail Pvt Ltd` on every row across all 5 file types | None |
| ERPNext warehouse name | Mapped value used, not the raw Stock Verify warehouse id | **VERIFIED** — `MAIN-WH` correctly mapped to `Stores - AR` in every file | None |
| Unmapped warehouse blocks export | An item with no active warehouse mapping never reaches an APPROVED preview | **VERIFIED** (pre-existing, re-confirmed by code read: `WAREHOUSE_MAPPING_MISSING` blocker + `approve_preview`'s "no blockers" gate) | None |
| Multi-company ambiguity | Two active mappings for the same warehouse id under different companies never silently resolve to one | **VERIFIED** (pre-existing, Step 3: exact `(warehouse_id, company)` key match, no fallback) | None |
| ERPNext UOM value | Mapped value used (`Nos`), not the raw Stock Verify UOM (`PCS`) | **VERIFIED** — every row shows `Nos`, never `PCS` | None |
| conversion_factor | Available for ERPNext to validate/apply | **VERIFIED GAP:** `uom_conversion_factor` is computed and stored on the frozen preview row, but **no CSV/XLSX column exports it** — confirmed by direct inspection of `_stock_entry_rows`/`_stock_reconciliation_rows` and the actual generated headers (11 columns each, no conversion-factor column). If ERPNext's own item-master UOM conversion differs even slightly from what Stock Verify assumed at preview time, the actually-imported quantity could silently differ from what was reviewed and approved, with no error surfaced anywhere. |
| Missing UOM blocks export | An item with no active UOM mapping never reaches an APPROVED preview | **VERIFIED** (pre-existing: `UOM_MAPPING_MISSING` blocker) | None |

## 6. Serial / Batch Verification

| Rule | Expected | Verified | Issue |
|---|---|---|---|
| Serialized items require serial numbers | Blocked before export if missing | **VERIFIED** (pre-existing `SERIAL_REQUIRED_MISSING` blocker; also re-exercised this step via the import-validation safety-net test) | None |
| One row per serial accepted | serials.csv/xlsx has one row per serial number, not one row per line | **VERIFIED** — 2 serials on one count line produced exactly 2 rows | None |
| Missing serial blocked before export | Same as above | **VERIFIED** | None |
| Batch-controlled items require batch_no | Blocked before export if missing | **VERIFIED** (pre-existing `BATCH_REQUIRED_MISSING` blocker) | None |
| One row per batch accepted, de-duplicated | batches.csv/xlsx has one row per unique batch_no | **VERIFIED** (pre-existing de-dup logic; confirmed by direct inspection: single BATCH-2026-07 row) | None |
| manufacturing_date / expiry_date format | Plain ISO-style date strings (`2026-01-15`) | **VERIFIED** by inspection — no time component, no locale-specific formatting, no Excel date-serialization applied (stored as plain strings, not datetime cells) | Acceptable as text; if the target ERPNext instance's Data Import expects a specific date format/type (native date cell vs. string), this should be confirmed against the real instance — **DOCUMENTED-BUT-UNCONFIRMED**. |
| Missing batch_no blocked before export | Same as above | **VERIFIED** | None |
| Batch doctype "Company" field | Exported, expected to map to ERPNext | Not verified live | See Section 3 — likely no corresponding field on ERPNext's core Batch doctype (**DOCUMENTED-BUT-UNCONFIRMED**) |

## 7. Photo Evidence Verification

| Rule | Expected | Verified | Issue |
|---|---|---|---|
| Photo manifest usable for audit | Every exported photo row traceable to session/export/count-line | **VERIFIED** — `Session ID`/`Export ID`/`Count Line ID` present on every row | None |
| `EXTERNAL_REFERENCE_ONLY` clearly understood | Status column explicit, not implied | **VERIFIED** — `Durability Status: EXTERNAL_REFERENCE_ONLY` literal string on the URL-only photo row | None |
| DURABLE entries include content hash | Every DURABLE (inline, real-bytes) photo appears in the exported file with its content hash | **VERIFIED GAP (confirmed by direct execution):** a count-line with `photo_base64` produces a real `DURABLE` entry with a genuine sha256 `content_hash` in the `erpnext_photo_manifests` snapshot document — but `_photo_manifest_rows()` only iterates `row.get("photo_proofs")` (URL references), never the manifest's separately-tracked inline/base64 entries. In the test scenario, the manifest snapshot correctly recorded 1 DURABLE entry, but the exported `photo-manifest.csv`/`.xlsx` contained **zero** rows for it — only the 1 `EXTERNAL_REFERENCE_ONLY` row from `photo_proofs` appeared. **The most durable, most trustworthy evidence category is the one silently missing from the operator-facing file.** |
| No base64 blobs appear in import files | Raw image bytes never leak into any CSV/XLSX | **VERIFIED** — grepped/inspected all 10 generated files; no `photo_base64` content anywhere, only URLs/hashes/status strings | None (this part of the design is correctly safe, independent of the row-omission bug above) |

## 8. Operator Workflow Review

| Step | Clear | Issue |
|---|---|---|
| Identify which file to import | Yes | Filenames are unambiguous kebab-case + correct extension (`stock-entry.csv`, `stock-entry.xlsx`, etc.), `Content-Disposition: attachment` sets the download filename explicitly |
| File names are clear | Yes | None |
| Validation result is understandable | Partially | `GET .../validate/{file_slug}` returns structured JSON (`valid`, `errors`, `warnings`, `row_count`, `column_count`) with enum-style error codes (e.g. `SERIALIZED_ITEM_WITHOUT_SERIAL:ITM-SERIAL-01`) rather than full plain-English sentences. Codes are still actionable (they name the failing item), but a non-technical operator may need a short glossary/legend mapping each code to a plain description. Minor UX gap, not a blocker. |
| Errors are actionable | Yes, with the caveat above | Every error code includes the specific `item_code` (or column name) responsible |
| No direct system write to ERPNext occurs | Yes | **VERIFIED** — grepped `backend/services/erpnext_export_*.py` and `backend/api/erpnext_exports_api.py` for any outbound HTTP client (`requests`, `httpx`, `aiohttp`) or ERPNext API/credential reference: zero matches. No network call to anything resembling an ERPNext server exists anywhere in this codebase. |

## 9. Required Fixes Before Final Signoff

1. **(Verified, should fix)** Include DURABLE inline-photo entries (from `photo_base64`) as rows in `photo-manifest.csv`/`.xlsx`, not just `photo_proofs` URL references — currently the highest-trust evidence category is silently absent from the operator-facing file.
2. **(Verified, should fix)** Export `uom_conversion_factor` as its own column on Stock Entry / Stock Reconciliation files, so a human operator (or ERPNext itself) can catch a mismatch against the target instance's own item-master conversion factor before it silently changes an approved quantity.
3. **(Needs confirmation against real ERPNext instance)** Resolve whether Stock Entry / Stock Reconciliation files are intended for the formal Data Import tool (which likely requires child-table-prefixed columns) or for direct grid-paste into the Items table (which the current flat format suits well) — this is a process/format decision, not something more code can resolve without live access.
4. **(Needs confirmation)** Verify whether the target ERPNext version still supports direct bulk-import into the standalone `Serial No` master doctype, or whether serial numbers should instead be supplied inline via the Stock Entry's own Serial No child field / Serial and Batch Bundle.
5. **(Needs confirmation)** Verify whether ERPNext's `Batch` doctype on the target instance has a `Company` field; if not, either drop the column or map it to an actual custom/reference field.
6. **(Needs confirmation)** Verify ERPNext's stock-entry validation actually accepts a negative `Qty` on a `Material Receipt`-type Stock Entry, or decide on an alternate handling for negative-opening-qty items (e.g. a different Stock Entry Type, or reconciliation-only export).
7. **(Minor, optional)** Add a short human-readable glossary for validation error codes to reduce operator dependence on reading source code to interpret them.

## 10. Final Verdict

**NOT_READY_FOR_MANUAL_IMPORT**

Rationale: this review found two code-verified correctness gaps (missing DURABLE photo rows, missing UOM conversion factor) that should be fixed before any handoff, plus a structural, unresolved question — whether the flat Stock Entry/Stock Reconciliation format matches the target ERPNext instance's actual import mechanism for a child-table doctype — that is significant enough (affecting 2 of 5 file types) not to call "minor," and cannot be resolved without contacting a real ERPNext instance, which was not available for this review. Per the explicit constraint governing this task, `READY_FOR_MANUAL_ERPNEXT_IMPORT` is not claimed, and given the open items above, `READY_FOR_MANUAL_IMPORT_AFTER_MINOR_FIXES` would understate the remaining uncertainty. Once items 1–2 are fixed and items 3–6 are confirmed (or refuted) against a real ERPNext staging instance, this should be re-run as a genuine live dry-run.
