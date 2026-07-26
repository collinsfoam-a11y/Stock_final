# ERPNext Operator Handoff Bundle

**This is the one document meant to be sent outside the Stock Verify repository
to the ERPNext operator/system administrator.** Everything the operator needs
to respond is self-contained below -- they should not need repo access or any
other Stock Verify document to complete this request.

Nothing in this request involves ERPNext API access, write credentials, or
any kind of automated integration. **Stock Verify will never push data to
ERPNext directly** -- this is a permanent product decision, not a temporary
limitation. The final integration is manual: a human operator imports
CSV/XLSX files that Stock Verify generates, using ERPNext's own Data Import
tool. This handoff is a one-time file/information exchange to make sure
those generated files actually match what your specific ERPNext instance
expects.

---

## 1. Why Stock Verify needs your real ERPNext templates

Stock Verify has already built and tested CSV/XLSX file generation for
Stock Entry, Stock Reconciliation, Serial No, and Batch imports -- but it has
only ever validated those files against its own best-effort guess of what
ERPNext expects, never against a template your specific ERPNext instance
actually produces. Different ERPNext versions, and any custom fields your
organization has configured, can change the exact columns, order, and
required fields Data Import expects. Until we compare against your real
templates, we cannot honestly claim the generated files are ready to import.

## 2. What files you need to download

| Requirement | Template |
|---|---|
| **Required** | Stock Entry Data Import template |
| **Required** | Stock Reconciliation Data Import template |
| **Conditional** — only if you confirm serial numbers are imported via the standalone Serial No doctype (see Section 4 below) | Serial No Data Import template |
| **Conditional** — only if you confirm batches are imported via the standalone Batch doctype (see Section 4 below) | Batch Data Import template |

If you're not sure whether the Serial No / Batch conditional templates
apply to you, download them anyway, or leave the corresponding question in
Section 4 as "unknown" and we'll follow up.

## 3. Exact ERPNext UI steps to download each template

In your ERPNext instance:

```
Data Import → New
  → Select DocType (e.g. "Stock Entry")
  → Select Import Type (e.g. "Insert New Records")
  → Save
  → Download Template
```

Repeat once per doctype above. This produces a file (CSV or XLSX, depending
on your ERPNext version/settings) containing the exact column headers your
instance's Data Import expects for that doctype today.

## 4. Metadata and questions we need answered

Please fill in what you can; write "unknown" for anything you're genuinely
not sure of rather than guessing -- we will never treat a guess as
confirmed, so an honest "unknown" is more useful to us than an incorrect
answer.

```
ERPNext version:
Frappe version:
Company name (exact, as configured in ERPNext):
Source instance: staging / production / unknown
Downloaded by:
Downloaded at:

Does this ERPNext instance use Serial and Batch Bundle?             yes / no / unknown
Is negative stock allowed for serialized/batched items?             yes / no / unknown
Can Stock Entry child item rows be imported through Data Import?    yes / no / unknown
Can Stock Reconciliation child item rows be imported through
  Data Import?                                                      yes / no / unknown
Can Serial No be imported directly through Data Import?              yes / no / unknown / not used
Can Batch be imported directly through Data Import?                  yes / no / unknown / not used
```

("Serial and Batch Bundle" is a feature introduced in ERPNext v15 that
changed how serial/batch tracking works -- if you're on an older version or
aren't sure, "unknown" is the correct answer, not a guess.)

## 5. File handling rules — please follow exactly

- **Do not edit the template headers.**
- **Do not remove any rows** (including any example/sample row ERPNext
  includes).
- **Do not rename any columns.**
- **Do not manually convert between XLSX and CSV** unless we specifically
  ask you to -- send the file in whatever format ERPNext generated.
- **Preserve the exact downloaded file** -- no reformatting, no re-saving
  through Excel/Google Sheets (either can silently change encoding or
  formatting even without visible edits).
- **If possible, provide a sha256 checksum for each file** (e.g. `sha256sum
  filename` on Linux/Mac, or `Get-FileHash filename` in PowerShell). This
  lets us confirm later that the file we're working with is still exactly
  what you sent.

## 6. Screenshots / evidence to include if possible

1. The ERPNext/Frappe version page (usually under the help/`?` menu, or
   `/app/about`).
2. The Data Import settings screen you used for each downloaded template
   (doctype + Import Type selected).
3. Whatever shows your Serial and Batch Bundle setting/status, if visible
   anywhere in your instance.
4. Any warning message ERPNext itself shows about the import template
   (some versions surface template-specific notes on the Data Import
   screen).
5. Any custom fields you notice in the downloaded templates that look
   specific to your organization (not part of a standard ERPNext install).

## 7. Return package checklist

Before sending everything back, please confirm you have:

- [ ] Stock Entry Data Import template file
- [ ] Stock Reconciliation Data Import template file
- [ ] Serial No Data Import template file (if applicable)
- [ ] Batch Data Import template file (if applicable)
- [ ] Section 4's metadata questions filled in (or explicitly marked
      "unknown")
- [ ] sha256 checksums, if you were able to generate them
- [ ] Any screenshots/evidence from Section 6 you were able to capture

## 8. What the Stock Verify team will do after receiving this

1. Place your files under `docs/erpnext_templates/` in the Stock Verify
   repository, exactly as received.
2. Update the internal manifest with the real version/metadata you provided
   -- never guessing at anything you leave as "unknown."
3. Run an automated presence check to confirm everything required has
   actually arrived.
4. Run a column-by-column comparison of Stock Verify's generated import
   files against your real templates.
5. Report back exactly what matches, what doesn't, and -- for anything that
   doesn't -- whether it needs a code change on our side, a mapping rule,
   an instruction for whoever does the manual import, or your team's
   explicit sign-off that the difference is acceptable.

No ERPNext credentials, API keys, or write access are needed at any point in
this process -- only the files and answers requested above.
