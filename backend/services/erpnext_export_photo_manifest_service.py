"""ERPNext export photo evidence manifest (BSR).

Builds a durable, hash-verifiable snapshot of the photo evidence referenced
by an APPROVED preview. Classifies each photo's actual durability rather
than assuming a URL reference is retrievable: `photo_proofs` entries
(id/url/timestamp -- see backend/api/schemas.py PhotoProof) never carry
their own bytes, so they are always EXTERNAL_REFERENCE_ONLY; a count_line's
separate, single `photo_base64` field, when present, is captured as its own
DURABLE entry with a real content hash. Never fabricates a hash or
durability status for evidence this codebase doesn't actually have.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)


class ErpNextExportPhotoManifestError(ValueError):
    """Request-level validation error (preview not found/not approved)."""


def _strip_id(doc: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if doc is None:
        return None
    doc = dict(doc)
    doc.pop("_id", None)
    return doc


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, default=str)


class ErpNextExportPhotoManifestService:
    def __init__(self, db: Any) -> None:
        self.db = db

    async def create_manifest(
        self, *, export_id: str, current_user: dict[str, Any]
    ) -> dict[str, Any]:
        preview = await self.db.erpnext_export_previews.find_one({"export_id": export_id})
        if preview is None:
            raise ErpNextExportPhotoManifestError(f"Export preview {export_id!r} not found")
        if preview.get("status") != "APPROVED":
            raise ErpNextExportPhotoManifestError(
                "Photo manifest can only be snapshotted for an APPROVED preview"
            )

        photos: list[dict[str, Any]] = []
        for row in preview.get("rows") or []:
            photos.extend(await self._classify_row_photos(row))

        manifest_hash = hashlib.sha256(_canonical_json(photos).encode("utf-8")).hexdigest()
        status = self._determine_status(photos)

        existing = await self.db.erpnext_photo_manifests.find(
            {"export_id": export_id}
        ).sort("manifest_version", -1).to_list(length=1)
        if existing and existing[0].get("manifest_hash") == manifest_hash:
            return _strip_id(existing[0])  # idempotent -- nothing changed since last snapshot

        next_version = int(existing[0].get("manifest_version") or 0) + 1 if existing else 1

        now = datetime.now(timezone.utc)
        doc = {
            "photo_manifest_id": str(uuid.uuid4()),
            "manifest_version": next_version,
            "export_id": export_id,
            "session_id": preview.get("session_id"),
            "company": preview.get("company"),
            "manifest_hash": manifest_hash,
            "status": status,
            "photos": photos,
            "created_by": str(current_user.get("username") or "system"),
            "created_at": now,
        }
        await self.db.erpnext_photo_manifests.insert_one(doc)
        await self._audit(current_user, doc)
        return _strip_id(doc)

    @staticmethod
    def _determine_status(photos: list[dict[str, Any]]) -> str:
        if not photos:
            return "SNAPSHOTTED"
        statuses = {p["durability_status"] for p in photos}
        if statuses == {"DURABLE"}:
            return "SNAPSHOTTED"
        if statuses == {"EXTERNAL_REFERENCE_ONLY"}:
            return "EXTERNAL_REFERENCES_ONLY"
        return "INCOMPLETE"

    async def _classify_row_photos(self, row: dict[str, Any]) -> list[dict[str, Any]]:
        count_line_id = row.get("count_line_id")
        item_code = row.get("item_code")
        source_line = None
        if count_line_id:
            source_line = await self.db.count_lines.find_one({"id": count_line_id})

        entries: list[dict[str, Any]] = []

        for proof in row.get("photo_proofs") or []:
            entries.append(
                {
                    "photo_id": proof.get("id") or str(uuid.uuid4()),
                    "item_code": item_code,
                    "row_key": count_line_id,
                    "source": "count_line",
                    "storage_kind": "external_url" if source_line is not None else "unknown",
                    "storage_key": None,
                    "public_reference": proof.get("url"),
                    "content_hash": None,
                    "captured_by": None,
                    "captured_at": proof.get("timestamp"),
                    # PhotoProof never carries its own bytes -- this is
                    # always a URL reference, never fabricated as durable.
                    "durability_status": (
                        "EXTERNAL_REFERENCE_ONLY" if source_line is not None else "UNKNOWN"
                    ),
                }
            )

        photo_base64 = (source_line or {}).get("photo_base64")
        if photo_base64:
            try:
                raw_bytes = base64.b64decode(photo_base64, validate=False)
            except Exception:
                raw_bytes = photo_base64.encode("utf-8")
            entries.append(
                {
                    "photo_id": f"{count_line_id}-inline",
                    "item_code": item_code,
                    "row_key": count_line_id,
                    "source": "count_line",
                    "storage_kind": "mongo_inline",
                    "storage_key": None,
                    "public_reference": None,
                    "content_hash": hashlib.sha256(raw_bytes).hexdigest(),
                    "captured_by": None,
                    "captured_at": None,
                    "durability_status": "DURABLE",
                }
            )

        return entries

    async def get_manifest(self, export_id: str) -> Optional[dict[str, Any]]:
        docs = await self.db.erpnext_photo_manifests.find(
            {"export_id": export_id}
        ).sort("manifest_version", -1).to_list(length=1)
        return _strip_id(docs[0]) if docs else None

    async def _audit(self, current_user: dict[str, Any], manifest: dict[str, Any]) -> None:
        try:
            from backend.models.audit import AuditEventType
            from backend.services.audit_service import AuditService

            await AuditService(self.db).log_event(
                event_type=AuditEventType.EXPORT_PHOTO_MANIFEST_SNAPSHOTTED,
                actor_id=current_user.get("username"),
                actor_username=current_user.get("username"),
                actor_role=current_user.get("role"),
                entity_type="erpnext_photo_manifest",
                entity_id=manifest["photo_manifest_id"],
                session_id=manifest.get("session_id"),
                details={
                    "photo_manifest_id": manifest["photo_manifest_id"],
                    "export_id": manifest["export_id"],
                    "manifest_hash": manifest["manifest_hash"],
                    "status": manifest["status"],
                    "photo_count": len(manifest.get("photos") or []),
                },
            )
        except Exception as exc:  # pragma: no cover - best-effort by contract
            logger.warning("Failed to audit photo manifest snapshot: %s", exc)
