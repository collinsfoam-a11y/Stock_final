"""ERPNext export file generation (BSR).

CSV/XLSX downloads generated exclusively from an APPROVED, hash-verified
erpnext_export_previews snapshot. Never re-reads count_lines/erp_items,
never recalculates quantities, never pushes to ERPNext. The only write is
stamping file_hashes/file_generated_at/file_generated_by metadata onto the
existing preview document -- rows/summary/blockers/warnings/approval_hash/
status are never touched.

CSV and XLSX are generated from the exact same row-building functions (see
_ROW_BUILDERS) so the two formats are guaranteed equivalent in content,
column order, and row count -- only the final serialization differs.
"""

from __future__ import annotations

import csv
import hashlib
import io
import logging
from datetime import datetime, timezone
from typing import Any

from openpyxl import Workbook

logger = logging.getLogger(__name__)

VALID_FILE_TYPES = (
    "stock_entry",
    "stock_reconciliation",
    "serials",
    "batches",
    "photo_manifest",
)

VALID_FILE_FORMATS = ("csv", "xlsx")

SLUG_BY_TYPE: dict[str, str] = {
    "stock_entry": "stock-entry",
    "stock_reconciliation": "stock-reconciliation",
    "serials": "serials",
    "batches": "batches",
    "photo_manifest": "photo-manifest",
}

SHEET_NAME_BY_TYPE: dict[str, str] = {
    "stock_entry": "Stock Entry",
    "stock_reconciliation": "Stock Reconciliation",
    "serials": "Serials",
    "batches": "Batches",
    "photo_manifest": "Photo Manifest",
}

MEDIA_TYPE_BY_FORMAT: dict[str, str] = {
    "csv": "text/csv",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

# Excel/CSV formula-injection prefixes (OWASP CSV injection). A leading
# apostrophe forces spreadsheet applications to treat the value as literal
# text instead of evaluating it as a formula. Applied to every string cell
# in both CSV and XLSX output, regardless of source (item master, mapping,
# or a correction proposal's free-text fields).
_FORMULA_INJECTION_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


class ErpNextExportFileError(ValueError):
    """Raised for request-level errors (preview not approved/ready)."""


class ErpNextExportFileNotFoundError(LookupError):
    """Raised when an export_id does not resolve to a preview record."""


class ErpNextExportFileIntegrityError(ErpNextExportFileError):
    """Raised when the frozen preview payload no longer matches its
    recorded approval_hash, or a regenerated file's hash unexpectedly
    differs from a previously recorded one for the same approved preview.
    Both indicate data corruption/tampering, not a normal client error."""


def sanitize_cell_value(value: Any) -> Any:
    if isinstance(value, str) and value.startswith(_FORMULA_INJECTION_PREFIXES):
        return "'" + value
    return value


def safe_sheet_name(name: str) -> str:
    """Excel worksheet names: max 31 chars, no `: \\ / ? * [ ]`, not blank."""
    cleaned = "".join(ch for ch in name if ch not in ":\\/?*[]")
    cleaned = cleaned.strip() or "Sheet1"
    return cleaned[:31]


def _serial_no_field(row: dict[str, Any]) -> str:
    return "\n".join(row.get("serial_numbers") or [])


def _remarks(preview: dict[str, Any], row: dict[str, Any]) -> str:
    corrected = row.get("remarks")
    if corrected:
        return str(corrected)
    return (
        f"session={preview.get('session_id')} "
        f"export={preview.get('export_id')} "
        f"v{preview.get('export_version')} "
        f"line={row.get('count_line_id')}"
    )


def _stock_entry_rows(preview: dict[str, Any]) -> tuple[list[str], list[dict[str, Any]]]:
    fieldnames = [
        "Company",
        "Stock Entry Type",
        "Is Opening",
        "Item Code",
        "Target Warehouse",
        "Qty",
        "UOM",
        "UOM Conversion Factor",
        "Basic Rate",
        "Batch No",
        "Serial No",
        "Remarks",
    ]
    company = preview.get("company")
    rows = [
        {
            "Company": company,
            "Stock Entry Type": "Material Receipt",
            "Is Opening": "Yes",
            "Item Code": row.get("item_code"),
            "Target Warehouse": row.get("erpnext_warehouse"),
            "Qty": row.get("erpnext_opening_qty"),
            "UOM": row.get("erpnext_uom"),
            # Straight from the frozen row -- never recalculated here.
            "UOM Conversion Factor": row.get("uom_conversion_factor"),
            "Basic Rate": row.get("mrp") or 0.0,
            "Batch No": row.get("batch_no") or "",
            "Serial No": _serial_no_field(row),
            "Remarks": _remarks(preview, row),
        }
        for row in preview.get("rows") or []
    ]
    return fieldnames, rows


def _stock_reconciliation_rows(preview: dict[str, Any]) -> tuple[list[str], list[dict[str, Any]]]:
    fieldnames = [
        "Company",
        "Item Code",
        "Warehouse",
        "Qty",
        "Current Qty",
        "Difference Qty",
        "UOM",
        "UOM Conversion Factor",
        "Valuation Rate",
        "Batch No",
        "Serial No",
        "Remarks",
    ]
    company = preview.get("company")
    rows = [
        {
            "Company": company,
            "Item Code": row.get("item_code"),
            "Warehouse": row.get("erpnext_warehouse"),
            "Qty": row.get("counted_qty"),
            "Current Qty": row.get("existing_sql_qty"),
            "Difference Qty": row.get("erpnext_adjustment_qty"),
            "UOM": row.get("erpnext_uom"),
            # Straight from the frozen row -- never recalculated here.
            "UOM Conversion Factor": row.get("uom_conversion_factor"),
            "Valuation Rate": row.get("mrp") or 0.0,
            "Batch No": row.get("batch_no") or "",
            "Serial No": _serial_no_field(row),
            "Remarks": _remarks(preview, row),
        }
        for row in preview.get("rows") or []
    ]
    return fieldnames, rows


def _serials_rows(preview: dict[str, Any]) -> tuple[list[str], list[dict[str, Any]]]:
    fieldnames = [
        "Serial No",
        "Item Code",
        "Warehouse",
        "Batch No",
        "Company",
        "Purchase Rate",
        "Status",
    ]
    company = preview.get("company")
    rows: list[dict[str, Any]] = []
    for row in preview.get("rows") or []:
        for serial in row.get("serial_numbers") or []:
            rows.append(
                {
                    "Serial No": serial,
                    "Item Code": row.get("item_code"),
                    "Warehouse": row.get("erpnext_warehouse"),
                    "Batch No": row.get("batch_no") or "",
                    "Company": company,
                    "Purchase Rate": row.get("mrp") or 0.0,
                    "Status": "Active",
                }
            )
    return fieldnames, rows


def _batches_rows(preview: dict[str, Any]) -> tuple[list[str], list[dict[str, Any]]]:
    fieldnames = ["Batch ID", "Item", "Manufacturing Date", "Expiry Date", "Company"]
    company = preview.get("company")
    seen_batches: set[str] = set()
    rows: list[dict[str, Any]] = []
    for row in preview.get("rows") or []:
        batch_no = row.get("batch_no")
        if not batch_no or batch_no in seen_batches:
            continue
        seen_batches.add(batch_no)
        rows.append(
            {
                "Batch ID": batch_no,
                "Item": row.get("item_code"),
                "Manufacturing Date": row.get("manufacturing_date") or "",
                "Expiry Date": row.get("expiry_date") or "",
                "Company": company,
            }
        )
    return fieldnames, rows


def _photo_manifest_rows(
    preview: dict[str, Any], photo_manifest: dict[str, Any] | None = None
) -> tuple[list[str], list[dict[str, Any]]]:
    """Sourced exclusively from `erpnext_photo_manifests.photos` -- never
    from `preview.rows[].photo_proofs`/live count_lines -- so every
    classified entry (DURABLE, EXTERNAL_REFERENCE_ONLY, and UNKNOWN alike)
    is exported, not just URL references. Without a manifest snapshot for
    this export_id, this correctly produces zero rows (headers only): the
    manifest is the sole source of truth here, so an operator must snapshot
    it first (see ErpNextExportPhotoManifestService.create_manifest)."""
    fieldnames = [
        "Photo ID",
        "Item Code",
        "Row Key",
        "Source",
        "Storage Kind",
        "Public Reference",
        "Content Hash",
        "Durability Status",
        "Captured At",
        "Captured By",
        "Photo Type",
        "Manifest Hash",
    ]
    manifest_hash = (photo_manifest or {}).get("manifest_hash") or ""
    rows: list[dict[str, Any]] = [
        {
            "Photo ID": photo.get("photo_id") or "",
            "Item Code": photo.get("item_code") or "",
            "Row Key": photo.get("row_key") or "",
            "Source": photo.get("source") or "",
            "Storage Kind": photo.get("storage_kind") or "",
            # Never the raw bytes -- only a URL reference (EXTERNAL_
            # REFERENCE_ONLY entries) or nothing at all (DURABLE inline
            # entries, whose only durable trace here is Content Hash).
            "Public Reference": photo.get("public_reference") or "",
            "Content Hash": photo.get("content_hash") or "",
            "Durability Status": photo.get("durability_status") or "",
            "Captured At": photo.get("captured_at") or "",
            "Captured By": photo.get("captured_by") or "",
            # No photo-type capture exists anywhere in this codebase --
            # left blank rather than fabricated. See
            # docs/BSR_REMEDIATION_STATUS.md Open Gaps.
            "Photo Type": "",
            "Manifest Hash": manifest_hash,
        }
        for photo in (photo_manifest or {}).get("photos") or []
    ]
    return fieldnames, rows


# Each builder returns (fieldnames, rows) from the frozen approved-preview
# snapshot only. photo_manifest needs the extra, separately-fetched
# manifest document; the others ignore the second positional slot.
_ROW_BUILDERS = {
    "stock_entry": lambda preview, _pm=None: _stock_entry_rows(preview),
    "stock_reconciliation": lambda preview, _pm=None: _stock_reconciliation_rows(preview),
    "serials": lambda preview, _pm=None: _serials_rows(preview),
    "batches": lambda preview, _pm=None: _batches_rows(preview),
    "photo_manifest": _photo_manifest_rows,
}


def build_rows(
    file_type: str, preview: dict[str, Any], photo_manifest: dict[str, Any] | None = None
) -> tuple[list[str], list[dict[str, Any]]]:
    """Single source of truth for a file type's columns/rows, shared by CSV
    generation, XLSX generation, and import-template validation."""
    return _ROW_BUILDERS[file_type](preview, photo_manifest)


def render_csv(fieldnames: list[str], rows: list[dict[str, Any]]) -> bytes:
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow({key: sanitize_cell_value(row.get(key)) for key in fieldnames})
    return output.getvalue().encode("utf-8")


def render_xlsx(fieldnames: list[str], rows: list[dict[str, Any]], sheet_name: str) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = safe_sheet_name(sheet_name)
    sheet.append(fieldnames)
    for row in rows:
        # Every value is written as literal cell data via openpyxl's model
        # API (never through a user-facing formula bar), and any
        # string that could be interpreted as a formula is neutralized by
        # sanitize_cell_value -- this cannot execute a formula in Excel.
        sheet.append([sanitize_cell_value(row.get(key)) for key in fieldnames])
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def render_file(
    file_type: str, file_format: str, preview: dict[str, Any], photo_manifest=None
) -> bytes:
    fieldnames, rows = build_rows(file_type, preview, photo_manifest)
    if file_format == "csv":
        return render_csv(fieldnames, rows)
    return render_xlsx(fieldnames, rows, SHEET_NAME_BY_TYPE[file_type])


def _file_hash_key(file_type: str, file_format: str) -> str:
    return f"{file_type}:{file_format}"


class ErpNextExportFileService:
    def __init__(self, db: Any) -> None:
        self.db = db

    async def generate_file(
        self,
        *,
        export_id: str,
        file_type: str,
        current_user: dict[str, Any],
        file_format: str = "csv",
    ) -> dict[str, Any]:
        if file_type not in VALID_FILE_TYPES:
            raise ErpNextExportFileError(f"Unknown export file type {file_type!r}")
        if file_format not in VALID_FILE_FORMATS:
            raise ErpNextExportFileError(f"Unknown export file format {file_format!r}")

        preview = await self.db.erpnext_export_previews.find_one({"export_id": export_id})
        if preview is None:
            raise ErpNextExportFileNotFoundError(f"Export preview {export_id!r} not found")

        if preview.get("status") != "APPROVED":
            raise ErpNextExportFileError(
                f"Cannot generate export files for a preview with status "
                f"{preview.get('status')!r}; only an APPROVED preview can be exported"
            )
        approval_hash = preview.get("approval_hash")
        if not approval_hash:
            raise ErpNextExportFileError("Approved preview has no approval_hash recorded")
        if not preview.get("company"):
            raise ErpNextExportFileError("Approved preview has no company recorded")
        if not preview.get("rows"):
            raise ErpNextExportFileError("Approved preview has no rows to export")

        # Defense in depth: approve_preview already guarantees the payload
        # matched its hash at approval time; re-verify here too, since file
        # generation must never trust anything it hasn't itself confirmed.
        from backend.services.erpnext_export_service import ErpNextExportService

        recomputed_hash = ErpNextExportService.compute_approval_hash(preview)
        if recomputed_hash != approval_hash:
            raise ErpNextExportFileIntegrityError(
                "Approved preview payload does not match its recorded approval_hash; "
                "refusing to generate a file from drifted data"
            )

        from backend.services.erpnext_export_correction_service import (
            ErpNextExportCorrectionService,
        )

        if await ErpNextExportCorrectionService(self.db).has_pending_proposals(export_id):
            raise ErpNextExportFileError(
                "Cannot generate export files while correction proposals are pending "
                "for this export; resolve them (approve or reject) first"
            )

        photo_manifest = None
        if file_type == "photo_manifest":
            from backend.services.erpnext_export_photo_manifest_service import (
                ErpNextExportPhotoManifestService,
            )

            photo_manifest = await ErpNextExportPhotoManifestService(self.db).get_manifest(
                export_id
            )

        content = render_file(file_type, file_format, preview, photo_manifest)
        file_hash = hashlib.sha256(content).hexdigest()

        hash_key = _file_hash_key(file_type, file_format)
        existing_hashes = preview.get("file_hashes") or {}
        previous_hash = existing_hashes.get(hash_key)
        if previous_hash and previous_hash != file_hash:
            # Rows are frozen and generation is a pure function of them, so
            # this should be unreachable for a correct implementation --
            # treated as a critical integrity failure, not a silent retry.
            raise ErpNextExportFileIntegrityError(
                "Regenerated file content hash does not match the previously "
                "recorded hash for this approved, immutable preview"
            )

        if not previous_hash:
            now = datetime.now(timezone.utc)
            username = str(current_user.get("username") or "system")
            # Whole-dict merge + single top-level $set rather than a dotted
            # path -- portable across the real driver and the in-memory
            # test double, and avoids any ambiguity about auto-vivifying a
            # not-yet-present sub-document.
            file_hashes = dict(existing_hashes)
            file_hashes[hash_key] = file_hash
            file_generated_at = dict(preview.get("file_generated_at") or {})
            file_generated_at[hash_key] = now
            file_generated_by = dict(preview.get("file_generated_by") or {})
            file_generated_by[hash_key] = username
            await self.db.erpnext_export_previews.update_one(
                {"export_id": export_id},
                {
                    "$set": {
                        "file_hashes": file_hashes,
                        "file_generated_at": file_generated_at,
                        "file_generated_by": file_generated_by,
                    }
                },
            )
            await self._audit_file_generated(
                current_user, preview, file_type, file_format, file_hash
            )

        return {
            "content": content,
            "filename": f"{SLUG_BY_TYPE[file_type]}.{file_format}",
            "file_hash": file_hash,
            "media_type": MEDIA_TYPE_BY_FORMAT[file_format],
        }

    async def _audit_file_generated(
        self,
        current_user: dict[str, Any],
        preview: dict[str, Any],
        file_type: str,
        file_format: str,
        file_hash: str,
    ) -> None:
        try:
            from backend.models.audit import AuditEventType
            from backend.services.audit_service import AuditService

            await AuditService(self.db).log_event(
                event_type=AuditEventType.EXPORT_FILE_GENERATED,
                actor_id=current_user.get("username"),
                actor_username=current_user.get("username"),
                actor_role=current_user.get("role"),
                entity_type="erpnext_export_preview",
                entity_id=preview["export_id"],
                session_id=preview["session_id"],
                details={
                    "export_id": preview["export_id"],
                    "file_type": file_type,
                    "format": file_format,
                    "file_hash": file_hash,
                    "line_count": len(preview.get("rows") or []),
                    "company": preview.get("company"),
                    "mode": preview.get("mode"),
                },
            )
        except Exception as exc:  # pragma: no cover - best-effort by contract
            logger.warning("Failed to audit export file generation: %s", exc)
