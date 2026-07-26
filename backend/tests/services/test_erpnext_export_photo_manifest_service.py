"""
Tests for the BSR ERPNext export photo evidence manifest: a durable,
hash-verifiable snapshot of photo evidence for an APPROVED preview.
"""

import base64
from datetime import datetime, timezone

import pytest

from backend.services.erpnext_export_file_service import ErpNextExportFileService
from backend.services.erpnext_export_photo_manifest_service import (
    ErpNextExportPhotoManifestError,
    ErpNextExportPhotoManifestService,
)
from backend.services.erpnext_export_service import ErpNextExportService
from backend.tests.utils.in_memory_db import InMemoryDatabase

CURRENT_USER = {"username": "supervisor1", "role": "supervisor"}
ADMIN_USER = {"username": "admin1", "role": "admin"}
DEFAULT_WAREHOUSE = "WH-1"
DEFAULT_UOM = "PCS"
DEFAULT_COMPANY = "Default Co"


async def _seed_finalized_session(db: InMemoryDatabase, session_id: str) -> None:
    await db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "status": "COMPLETED",
            "warehouse": DEFAULT_WAREHOUSE,
            "finalized_at": datetime.now(timezone.utc),
            "version": 1,
        }
    )


async def _seed_default_mappings(db: InMemoryDatabase) -> None:
    await db.erpnext_warehouse_mappings.insert_one(
        {
            "mapping_id": "map-wh-1",
            "stock_verify_warehouse_id": DEFAULT_WAREHOUSE,
            "stock_verify_warehouse_name": DEFAULT_WAREHOUSE,
            "erpnext_warehouse": "Stores - CO",
            "company": DEFAULT_COMPANY,
            "is_active": True,
            "created_by": "admin1",
            "created_at": datetime.now(timezone.utc),
            "updated_by": None,
            "updated_at": None,
        }
    )
    await db.erpnext_uom_mappings.insert_one(
        {
            "mapping_id": "map-uom-1",
            "stock_verify_uom": DEFAULT_UOM,
            "erpnext_uom": "Nos",
            "conversion_factor": 1.0,
            "is_active": True,
            "created_by": "admin1",
            "created_at": datetime.now(timezone.utc),
            "updated_by": None,
            "updated_at": None,
        }
    )


async def _seed_erp_item(db: InMemoryDatabase, item_code: str, **overrides) -> None:
    doc = {
        "item_code": item_code,
        "item_name": f"Item {item_code}",
        "warehouse": DEFAULT_WAREHOUSE,
        "uom_code": DEFAULT_UOM,
        "stock_qty": 90.0,
        "mrp": 25.0,
        "last_synced": datetime.now(timezone.utc),
    }
    doc.update(overrides)
    await db.erp_items.insert_one(doc)


async def _seed_approved_line(db: InMemoryDatabase, session_id: str, item_code: str, **overrides):
    doc = {
        "id": f"line-{item_code}-{session_id}",
        "session_id": session_id,
        "item_code": item_code,
        "item_name": f"Item {item_code}",
        "counted_qty": 100.0,
        "erp_qty": 100.0,
        "approval_status": "APPROVED",
        "status": "approved",
        "uom_code": DEFAULT_UOM,
    }
    doc.update(overrides)
    await db.count_lines.insert_one(doc)
    return doc


async def _approve_preview(
    db: InMemoryDatabase, session_id: str, item_code: str, *, line_overrides=None
) -> dict:
    await _seed_finalized_session(db, session_id)
    await _seed_default_mappings(db)
    await _seed_erp_item(db, item_code)
    await _seed_approved_line(db, session_id, item_code, **(line_overrides or {}))
    preview = await ErpNextExportService(db).generate_preview(
        session_id=session_id, mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )
    await ErpNextExportService(db).approve_preview(
        export_id=preview["export_id"], current_user=ADMIN_USER
    )
    return await db.erpnext_export_previews.find_one({"export_id": preview["export_id"]})


@pytest.mark.asyncio
async def test_create_manifest_from_approved_preview_photo_references():
    db = InMemoryDatabase()
    approved = await _approve_preview(
        db,
        "sess-1",
        "ITEM-1",
        line_overrides={
            "photo_proofs": [
                {"id": "photo-1", "url": "https://example.com/p1.jpg", "timestamp": "2026-01-01T00:00:00Z"}
            ]
        },
    )
    service = ErpNextExportPhotoManifestService(db)

    manifest = await service.create_manifest(
        export_id=approved["export_id"], current_user=ADMIN_USER
    )

    assert manifest["export_id"] == approved["export_id"]
    assert manifest["session_id"] == "sess-1"
    assert manifest["company"] == DEFAULT_COMPANY
    assert len(manifest["photos"]) == 1
    assert manifest["photos"][0]["photo_id"] == "photo-1"
    assert manifest["photos"][0]["public_reference"] == "https://example.com/p1.jpg"
    assert manifest["photos"][0]["durability_status"] == "EXTERNAL_REFERENCE_ONLY"
    assert manifest["status"] == "EXTERNAL_REFERENCES_ONLY"


@pytest.mark.asyncio
async def test_cannot_create_manifest_for_non_approved_preview():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-2")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITEM-2")
    await _seed_approved_line(db, "sess-2", "ITEM-2")
    preview = await ErpNextExportService(db).generate_preview(
        session_id="sess-2", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )
    service = ErpNextExportPhotoManifestService(db)

    with pytest.raises(ErpNextExportPhotoManifestError):
        await service.create_manifest(export_id=preview["export_id"], current_user=ADMIN_USER)


@pytest.mark.asyncio
async def test_manifest_hash_is_deterministic():
    db = InMemoryDatabase()
    approved = await _approve_preview(
        db,
        "sess-3",
        "ITEM-3",
        line_overrides={
            "photo_proofs": [
                {"id": "photo-1", "url": "https://example.com/p1.jpg", "timestamp": "2026-01-01T00:00:00Z"}
            ]
        },
    )
    service = ErpNextExportPhotoManifestService(db)

    manifest = await service.create_manifest(
        export_id=approved["export_id"], current_user=ADMIN_USER
    )
    fetched = await service.get_manifest(approved["export_id"])

    assert fetched["manifest_hash"] == manifest["manifest_hash"]
    assert len(manifest["manifest_hash"]) == 64  # sha256 hex digest length


@pytest.mark.asyncio
async def test_photo_with_inline_bytes_is_marked_durable_with_content_hash():
    db = InMemoryDatabase()
    photo_bytes = b"not-a-real-jpeg-but-real-bytes"
    photo_base64 = base64.b64encode(photo_bytes).decode("ascii")
    approved = await _approve_preview(
        db,
        "sess-4",
        "ITEM-4",
        line_overrides={"photo_base64": photo_base64},
    )
    service = ErpNextExportPhotoManifestService(db)

    manifest = await service.create_manifest(
        export_id=approved["export_id"], current_user=ADMIN_USER
    )

    assert len(manifest["photos"]) == 1
    entry = manifest["photos"][0]
    assert entry["durability_status"] == "DURABLE"
    assert entry["storage_kind"] == "mongo_inline"
    import hashlib

    assert entry["content_hash"] == hashlib.sha256(photo_bytes).hexdigest()
    assert manifest["status"] == "SNAPSHOTTED"


@pytest.mark.asyncio
async def test_missing_photo_bytes_do_not_crash():
    """The source count_line has vanished by manifest-creation time (edge
    case) -- must not crash, must classify honestly rather than fabricate."""
    db = InMemoryDatabase()
    approved = await _approve_preview(
        db,
        "sess-5",
        "ITEM-5",
        line_overrides={
            "photo_proofs": [
                {"id": "photo-1", "url": "https://example.com/p1.jpg", "timestamp": "2026-01-01T00:00:00Z"}
            ]
        },
    )
    # Simulate the source count_line disappearing after approval.
    await db.count_lines.delete_many({"session_id": "sess-5"})
    service = ErpNextExportPhotoManifestService(db)

    manifest = await service.create_manifest(
        export_id=approved["export_id"], current_user=ADMIN_USER
    )

    assert len(manifest["photos"]) == 1
    assert manifest["photos"][0]["durability_status"] == "UNKNOWN"


@pytest.mark.asyncio
async def test_no_photos_at_all_produces_empty_snapshotted_manifest():
    db = InMemoryDatabase()
    approved = await _approve_preview(db, "sess-5b", "ITEM-5B")
    service = ErpNextExportPhotoManifestService(db)

    manifest = await service.create_manifest(
        export_id=approved["export_id"], current_user=ADMIN_USER
    )

    assert manifest["photos"] == []
    assert manifest["status"] == "SNAPSHOTTED"


@pytest.mark.asyncio
async def test_photo_manifest_csv_includes_manifest_and_content_hash_fields():
    db = InMemoryDatabase()
    photo_bytes = b"inline-photo-bytes"
    photo_base64 = base64.b64encode(photo_bytes).decode("ascii")
    approved = await _approve_preview(
        db,
        "sess-6",
        "ITEM-6",
        line_overrides={
            "photo_proofs": [
                {"id": "photo-1", "url": "https://example.com/p1.jpg", "timestamp": "2026-01-01T00:00:00Z"}
            ],
            "photo_base64": photo_base64,
        },
    )
    manifest_service = ErpNextExportPhotoManifestService(db)
    manifest = await manifest_service.create_manifest(
        export_id=approved["export_id"], current_user=ADMIN_USER
    )

    file_service = ErpNextExportFileService(db)
    result = await file_service.generate_file(
        export_id=approved["export_id"], file_type="photo_manifest", current_user=ADMIN_USER
    )
    content = result["content"].decode("utf-8")

    assert "Manifest Hash" in content.splitlines()[0]
    assert "Content Hash" in content.splitlines()[0]
    assert "Durability Status" in content.splitlines()[0]
    assert manifest["manifest_hash"] in content


@pytest.mark.asyncio
async def test_repeated_manifest_snapshot_is_idempotent():
    db = InMemoryDatabase()
    approved = await _approve_preview(
        db,
        "sess-7",
        "ITEM-7",
        line_overrides={
            "photo_proofs": [
                {"id": "photo-1", "url": "https://example.com/p1.jpg", "timestamp": "2026-01-01T00:00:00Z"}
            ]
        },
    )
    service = ErpNextExportPhotoManifestService(db)

    first = await service.create_manifest(export_id=approved["export_id"], current_user=ADMIN_USER)
    second = await service.create_manifest(export_id=approved["export_id"], current_user=ADMIN_USER)

    assert first["photo_manifest_id"] == second["photo_manifest_id"]
    assert first["manifest_version"] == second["manifest_version"]
    stored = await db.erpnext_photo_manifests.find(
        {"export_id": approved["export_id"]}
    ).to_list(length=10)
    assert len(stored) == 1  # no duplicate version created


@pytest.mark.asyncio
async def test_audit_event_is_written_on_manifest_snapshot():
    db = InMemoryDatabase()
    approved = await _approve_preview(
        db,
        "sess-8",
        "ITEM-8",
        line_overrides={
            "photo_proofs": [
                {"id": "photo-1", "url": "https://example.com/p1.jpg", "timestamp": "2026-01-01T00:00:00Z"}
            ]
        },
    )
    service = ErpNextExportPhotoManifestService(db)

    manifest = await service.create_manifest(
        export_id=approved["export_id"], current_user=ADMIN_USER
    )

    entry = await db.audit_logs.find_one(
        {"entity_id": manifest["photo_manifest_id"], "event_type": "EXPORT_PHOTO_MANIFEST_SNAPSHOTTED"}
    )
    assert entry is not None
    assert entry["details"]["manifest_hash"] == manifest["manifest_hash"]
    assert entry["details"]["photo_count"] == 1


@pytest.mark.asyncio
async def test_approved_preview_remains_immutable_after_manifest_snapshot():
    db = InMemoryDatabase()
    approved = await _approve_preview(
        db,
        "sess-9",
        "ITEM-9",
        line_overrides={
            "photo_proofs": [
                {"id": "photo-1", "url": "https://example.com/p1.jpg", "timestamp": "2026-01-01T00:00:00Z"}
            ]
        },
    )
    rows_before = approved["rows"]
    approval_hash_before = approved["approval_hash"]
    service = ErpNextExportPhotoManifestService(db)

    await service.create_manifest(export_id=approved["export_id"], current_user=ADMIN_USER)

    stored = await db.erpnext_export_previews.find_one({"export_id": approved["export_id"]})
    assert stored["rows"] == rows_before
    assert stored["approval_hash"] == approval_hash_before
    assert stored["status"] == "APPROVED"
