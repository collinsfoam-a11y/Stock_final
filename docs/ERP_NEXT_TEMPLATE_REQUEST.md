# ERPNext Template & Version Information Request

> **A single, self-contained, sendable version of this request now exists at
> [`docs/ERP_NEXT_OPERATOR_HANDOFF_BUNDLE.md`](ERP_NEXT_OPERATOR_HANDOFF_BUNDLE.md)
> -- send that file to the ERPNext operator, not this one.** This document
> remains as internal detail/rationale for the Stock Verify team; the bundle
> is the one meant to leave the repo.

**To:** ERPNext operator / system administrator for the target instance
**From:** Stock Verify BSR remediation
**Purpose:** Stock Verify's manual CSV/XLSX import capability is fully built and tested, but it cannot honestly claim readiness for a manual ERPNext import dry-run until it has been checked against the *real* import templates and configuration of your specific ERPNext instance. Nothing in this request asks for API access or write credentials — Stock Verify never pushes to ERPNext directly and never will (permanent product decision). This is a one-time information/file handoff.

Please provide the 10 items below and the 2-4 template files. Everything can be sent as plain files/screenshots by whatever channel your organization normally uses for this kind of handoff.

---

## What to provide

1. **ERPNext version** (exact, e.g. `v14.34.2` or `v15.2.1`) — found under the ERPNext "About" page (usually the help/`?` menu, or `/app/about`).
2. **Frappe version**, if shown on the same "About" page.
3. **Company name exactly as configured in ERPNext** (Setup > Company, or visible in the top-right company switcher) — must match character-for-character, since Stock Verify's export files carry a `Company` column that must match ERPNext's own record.
4. **Whether the target instance uses Serial and Batch Bundle** (a feature introduced in ERPNext v15 that changed how serial/batch tracking works). Yes / No / Not sure.
5. **Whether negative stock is allowed for serialized/batched items** on this instance (Stock Settings, or simply: has anyone ever successfully created a negative-quantity Stock Entry/Reconciliation for a serialized or batched item here?). Yes / No / Not sure.
6. **Whether Stock Entry child (item) rows can be imported through Data Import** — i.e., can a single Data Import file create a Stock Entry with multiple item lines, or does Data Import only support one row per document?
7. **Whether Stock Entry child rows must instead be pasted manually into the Items table** in the ERPNext form UI (a common alternative when Data Import doesn't support the child table directly).
8. **Whether Stock Reconciliation child (item) rows can be imported through Data Import**, same question as #6 but for Stock Reconciliation.
9. **Whether Serial No can be imported directly through Data Import** as its own standalone doctype (only relevant if your workflow still uses the classic Serial No doctype rather than Serial and Batch Bundle).
10. **Whether Batch can be imported directly through Data Import** as its own standalone doctype (same caveat as #9).

## Templates to download and return

Using **your target ERPNext instance's own UI** (not a generic ERPNext download — it must come from *this* instance, since Data Import templates can vary by version and by custom fields configured on your site):

1. **Stock Entry** Data Import template — **required**.
2. **Stock Reconciliation** Data Import template — **required**.
3. **Serial No** Data Import template — **only if** you use the classic Serial No import path (see item #9 above).
4. **Batch** Data Import template — **only if** you use the classic Batch import path (see item #10 above).

### How to download each template

In the ERPNext UI:

```
Data Import
  → Select the DocType (e.g. "Stock Entry")
  → Select the Import Type (e.g. "Insert New Records")
  → Save
  → Download Template
```

This produces a file (CSV or XLSX, depending on your ERPNext version/settings) with the exact column headers ERPNext expects for that doctype today.

## Rules for handling the downloaded files — please follow exactly

- **Do not edit the template headers.**
- **Do not rename any columns.**
- **Do not remove hidden or "mandatory" columns**, even if they look unfamiliar — Stock Verify needs to see the real, complete header set, not a trimmed one.
- **Do not manually convert XLSX to CSV** (or vice versa) unless we specifically ask you to. Send the file in whatever format ERPNext generated it.
- **Keep the downloaded file exactly as ERPNext produced it** — no reformatting, no re-saving through Excel/Google Sheets (which can silently change formatting or encoding).
- If possible, also include a **screenshot of the ERPNext version/About page** and a **screenshot of the Data Import template-download screen** for each doctype (helps us confirm the Import Type and doctype settings that were selected).

## What happens next

Once we receive these files and answers, we will:

1. Place the files under `docs/erpnext_templates/` in the Stock Verify repository.
2. Run an automated presence check (`scripts/check_erpnext_template_inputs.py`) to confirm everything required was received.
3. Run `ErpNextTemplateValidationService` to compare Stock Verify's generated export files against your real templates, column-by-column.
4. Report back exactly what matches, what doesn't, and what (if anything) needs a code change, a mapping rule, or your team's sign-off on an acceptable difference.

No ERPNext credentials, API keys, or write access are needed at any point in this process — only the files and answers listed above.

See also: `docs/ERP_NEXT_TEMPLATE_INTAKE_CHECKLIST.md` (tracks what has and hasn't arrived yet) and `docs/erpnext_templates/README.md` (technical detail on how these files are consumed).
