"""ERPNext export settings (BSR): warehouse mappings, UOM mappings, and
item export-control flags.

These replace inference-based export blockers (see erpnext_export_service.py)
with explicit, admin-maintained mappings/flags. Mappings are never deleted,
only deactivated (is_active=False), preserving history. Every create/update
is audited via EXPORT_MAPPING_CHANGED.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

_ITEM_EXPORT_FLAG_FIELDS = (
    "is_serialized",
    "is_batch_controlled",
    "allow_negative_opening_qty",
    "requires_photo_for_export",
    "requires_item_master_validation",
)


class ErpNextExportSettingsError(ValueError):
    """Request-level validation error (bad input, conflicting active mapping, not found)."""


def _strip_id(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    if doc is None:
        return None
    doc = dict(doc)
    doc.pop("_id", None)
    return doc


class ErpNextExportSettingsService:
    def __init__(self, db: Any) -> None:
        self.db = db

    # ---------------- Warehouse mappings ----------------

    async def create_warehouse_mapping(
        self,
        *,
        stock_verify_warehouse_id: str,
        stock_verify_warehouse_name: str,
        erpnext_warehouse: str,
        company: str,
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        stock_verify_warehouse_id = str(stock_verify_warehouse_id or "").strip()
        stock_verify_warehouse_name = str(stock_verify_warehouse_name or "").strip()
        erpnext_warehouse = str(erpnext_warehouse or "").strip()
        company = str(company or "").strip()
        if not stock_verify_warehouse_id or not erpnext_warehouse or not company:
            raise ErpNextExportSettingsError(
                "stock_verify_warehouse_id, erpnext_warehouse, and company are required"
            )

        conflict = await self.db.erpnext_warehouse_mappings.find_one(
            {
                "stock_verify_warehouse_id": stock_verify_warehouse_id,
                "company": company,
                "is_active": True,
            }
        )
        if conflict:
            raise ErpNextExportSettingsError(
                f"An active mapping already exists for warehouse "
                f"{stock_verify_warehouse_id!r} / company {company!r}; "
                "deactivate it first or PATCH the existing mapping."
            )

        now = datetime.now(timezone.utc)
        doc = {
            "mapping_id": str(uuid.uuid4()),
            "stock_verify_warehouse_id": stock_verify_warehouse_id,
            "stock_verify_warehouse_name": stock_verify_warehouse_name,
            "erpnext_warehouse": erpnext_warehouse,
            "company": company,
            "is_active": True,
            "created_by": str(current_user.get("username") or "system"),
            "created_at": now,
            "updated_by": None,
            "updated_at": None,
        }
        await self.db.erpnext_warehouse_mappings.insert_one(doc)
        await self._audit("WAREHOUSE_MAPPING_CREATED", current_user, after=doc)
        return _strip_id(doc)

    async def list_warehouse_mappings(self, *, active_only: bool = False) -> list[dict[str, Any]]:
        query = {"is_active": True} if active_only else {}
        docs = await self.db.erpnext_warehouse_mappings.find(query).to_list(length=10000)
        return [_strip_id(d) for d in docs]

    async def list_distinct_active_companies(self) -> list[str]:
        """Used only to decide whether a caller-omitted `company` can be
        safely derived (exactly one active company configured) instead of
        fabricated -- see ErpNextExportService._resolve_company."""
        docs = await self.db.erpnext_warehouse_mappings.find({"is_active": True}).to_list(
            length=10000
        )
        companies = {str(doc.get("company")) for doc in docs if doc.get("company")}
        return sorted(companies)

    async def update_warehouse_mapping(
        self,
        mapping_id: str,
        *,
        updates: dict[str, Any],
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        existing = await self.db.erpnext_warehouse_mappings.find_one({"mapping_id": mapping_id})
        if not existing:
            raise ErpNextExportSettingsError(f"Warehouse mapping {mapping_id!r} not found")

        set_fields: dict[str, Any] = {}
        if updates.get("erpnext_warehouse") is not None:
            value = str(updates["erpnext_warehouse"]).strip()
            if not value:
                raise ErpNextExportSettingsError("erpnext_warehouse cannot be blank")
            set_fields["erpnext_warehouse"] = value
        if updates.get("stock_verify_warehouse_name") is not None:
            set_fields["stock_verify_warehouse_name"] = str(
                updates["stock_verify_warehouse_name"]
            ).strip()
        if "is_active" in updates and updates["is_active"] is not None:
            new_active = bool(updates["is_active"])
            if new_active and not existing.get("is_active"):
                conflict = await self.db.erpnext_warehouse_mappings.find_one(
                    {
                        "stock_verify_warehouse_id": existing["stock_verify_warehouse_id"],
                        "company": existing["company"],
                        "is_active": True,
                        "mapping_id": {"$ne": mapping_id},
                    }
                )
                if conflict:
                    raise ErpNextExportSettingsError(
                        "Cannot reactivate: another active mapping already exists "
                        "for this warehouse/company"
                    )
            set_fields["is_active"] = new_active

        if not set_fields:
            return _strip_id(existing)

        set_fields["updated_by"] = str(current_user.get("username") or "system")
        set_fields["updated_at"] = datetime.now(timezone.utc)
        await self.db.erpnext_warehouse_mappings.update_one(
            {"mapping_id": mapping_id}, {"$set": set_fields}
        )
        updated = await self.db.erpnext_warehouse_mappings.find_one({"mapping_id": mapping_id})
        await self._audit(
            "WAREHOUSE_MAPPING_UPDATED", current_user, before=_strip_id(existing), after=updated
        )
        return _strip_id(updated)

    async def find_active_warehouse_mapping(
        self, *, stock_verify_warehouse_id: str | None, company: str
    ) -> dict[str, Any] | None:
        """Company is now mandatory context for this lookup (see
        docs/BSR_REMEDIATION_STATUS.md): the mapping key is
        (stock_verify_warehouse_id, company), so an explicit company
        disambiguates what previously had to be treated as "unmapped" when
        more than one company had a mapping for the same warehouse id."""
        if not stock_verify_warehouse_id or not company:
            return None
        doc = await self.db.erpnext_warehouse_mappings.find_one(
            {
                "stock_verify_warehouse_id": stock_verify_warehouse_id,
                "company": company,
                "is_active": True,
            }
        )
        return _strip_id(doc)

    # ---------------- UOM mappings ----------------

    async def create_uom_mapping(
        self,
        *,
        stock_verify_uom: str,
        erpnext_uom: str,
        conversion_factor: float | None,
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        stock_verify_uom = str(stock_verify_uom or "").strip()
        erpnext_uom = str(erpnext_uom or "").strip()
        if not stock_verify_uom or not erpnext_uom:
            raise ErpNextExportSettingsError("stock_verify_uom and erpnext_uom are required")
        factor = float(conversion_factor if conversion_factor is not None else 1.0)
        if factor <= 0:
            raise ErpNextExportSettingsError("conversion_factor must be positive")

        conflict = await self.db.erpnext_uom_mappings.find_one(
            {"stock_verify_uom": stock_verify_uom, "is_active": True}
        )
        if conflict:
            raise ErpNextExportSettingsError(
                f"An active mapping already exists for UOM {stock_verify_uom!r}; "
                "deactivate it first or PATCH the existing mapping."
            )

        now = datetime.now(timezone.utc)
        doc = {
            "mapping_id": str(uuid.uuid4()),
            "stock_verify_uom": stock_verify_uom,
            "erpnext_uom": erpnext_uom,
            "conversion_factor": factor,
            "is_active": True,
            "created_by": str(current_user.get("username") or "system"),
            "created_at": now,
            "updated_by": None,
            "updated_at": None,
        }
        await self.db.erpnext_uom_mappings.insert_one(doc)
        await self._audit("UOM_MAPPING_CREATED", current_user, after=doc)
        return _strip_id(doc)

    async def list_uom_mappings(self, *, active_only: bool = False) -> list[dict[str, Any]]:
        query = {"is_active": True} if active_only else {}
        docs = await self.db.erpnext_uom_mappings.find(query).to_list(length=10000)
        return [_strip_id(d) for d in docs]

    async def update_uom_mapping(
        self,
        mapping_id: str,
        *,
        updates: dict[str, Any],
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        existing = await self.db.erpnext_uom_mappings.find_one({"mapping_id": mapping_id})
        if not existing:
            raise ErpNextExportSettingsError(f"UOM mapping {mapping_id!r} not found")

        set_fields: dict[str, Any] = {}
        if updates.get("erpnext_uom") is not None:
            value = str(updates["erpnext_uom"]).strip()
            if not value:
                raise ErpNextExportSettingsError("erpnext_uom cannot be blank")
            set_fields["erpnext_uom"] = value
        if "conversion_factor" in updates and updates["conversion_factor"] is not None:
            factor = float(updates["conversion_factor"])
            if factor <= 0:
                raise ErpNextExportSettingsError("conversion_factor must be positive")
            set_fields["conversion_factor"] = factor
        if "is_active" in updates and updates["is_active"] is not None:
            new_active = bool(updates["is_active"])
            if new_active and not existing.get("is_active"):
                conflict = await self.db.erpnext_uom_mappings.find_one(
                    {
                        "stock_verify_uom": existing["stock_verify_uom"],
                        "is_active": True,
                        "mapping_id": {"$ne": mapping_id},
                    }
                )
                if conflict:
                    raise ErpNextExportSettingsError(
                        "Cannot reactivate: another active mapping already exists for this UOM"
                    )
            set_fields["is_active"] = new_active

        if not set_fields:
            return _strip_id(existing)

        set_fields["updated_by"] = str(current_user.get("username") or "system")
        set_fields["updated_at"] = datetime.now(timezone.utc)
        await self.db.erpnext_uom_mappings.update_one(
            {"mapping_id": mapping_id}, {"$set": set_fields}
        )
        updated = await self.db.erpnext_uom_mappings.find_one({"mapping_id": mapping_id})
        await self._audit(
            "UOM_MAPPING_UPDATED", current_user, before=_strip_id(existing), after=updated
        )
        return _strip_id(updated)

    async def find_active_uom_mapping(
        self, *, stock_verify_uom: str | None
    ) -> dict[str, Any] | None:
        if not stock_verify_uom:
            return None
        doc = await self.db.erpnext_uom_mappings.find_one(
            {"stock_verify_uom": stock_verify_uom, "is_active": True}
        )
        return _strip_id(doc)

    # ---------------- Item export-control flags ----------------

    async def upsert_item_flags(
        self,
        item_code: str,
        *,
        updates: dict[str, Any],
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        item_code = str(item_code or "").strip()
        if not item_code:
            raise ErpNextExportSettingsError("item_code is required")

        set_fields = {
            key: bool(value)
            for key, value in updates.items()
            if key in _ITEM_EXPORT_FLAG_FIELDS and value is not None
        }
        if not set_fields:
            raise ErpNextExportSettingsError(
                f"At least one of {_ITEM_EXPORT_FLAG_FIELDS} must be provided"
            )

        existing = await self.db.erpnext_item_export_flags.find_one({"item_code": item_code})
        now = datetime.now(timezone.utc)
        username = str(current_user.get("username") or "system")

        if existing:
            set_fields["updated_by"] = username
            set_fields["updated_at"] = now
            await self.db.erpnext_item_export_flags.update_one(
                {"item_code": item_code}, {"$set": set_fields}
            )
            updated = await self.db.erpnext_item_export_flags.find_one({"item_code": item_code})
            await self._audit(
                "ITEM_EXPORT_FLAGS_UPDATED",
                current_user,
                before=_strip_id(existing),
                after=updated,
            )
            return _strip_id(updated)

        doc: dict[str, Any] = {
            "item_code": item_code,
            "is_serialized": None,
            "is_batch_controlled": None,
            "allow_negative_opening_qty": None,
            "requires_photo_for_export": None,
            "created_by": username,
            "created_at": now,
            "updated_by": None,
            "updated_at": None,
        }
        doc.update(set_fields)
        await self.db.erpnext_item_export_flags.insert_one(doc)
        await self._audit("ITEM_EXPORT_FLAGS_CREATED", current_user, after=doc)
        return _strip_id(doc)

    async def get_item_flags(self, item_code: str) -> dict[str, Any] | None:
        item_code = str(item_code or "").strip()
        if not item_code:
            return None
        doc = await self.db.erpnext_item_export_flags.find_one({"item_code": item_code})
        return _strip_id(doc)

    async def resolve_item_export_flags(
        self,
        *,
        erp_item: dict[str, Any] | None,
        item_code: str,
    ) -> dict[str, bool]:
        """Effective flags used by the preview.

        Source order: (1) ERP/item master field, only for `is_serialized`
        (the one flag that already exists on the item master today -- see
        docs/BSR_REMEDIATION_STATUS.md); (2) the explicit
        erpnext_item_export_flags collection; (3) a safe False default.
        Never infers is_batch_controlled from batch_no presence.
        """
        flags_doc = await self.get_item_flags(item_code) if item_code else None

        def _pick(key: str, *, erp_key: str | None = None) -> bool:
            if erp_key and isinstance(erp_item, dict) and erp_item.get(erp_key) is not None:
                return bool(erp_item.get(erp_key))
            if flags_doc is not None and flags_doc.get(key) is not None:
                return bool(flags_doc.get(key))
            return False

        return {
            "is_serialized": _pick("is_serialized", erp_key="is_serialized"),
            "is_batch_controlled": _pick("is_batch_controlled"),
            "allow_negative_opening_qty": _pick("allow_negative_opening_qty"),
            "requires_photo_for_export": _pick("requires_photo_for_export"),
            # Gates the Step 8 GST/HSN/category/valuation item-master
            # blockers (ITEM_CATEGORY_MISSING, HSN_SAC_MISSING,
            # GST_PERCENTAGE_MISSING, HSN_SAC_INVALID,
            # HSN_GST_RATE_MISMATCH, VALUATION_RATE_MISSING). Defaults False
            # so existing/legacy items are never retroactively blocked by a
            # brand-new check before their SQL master data has actually
            # been backfilled -- opt in per item as GST/HSN data becomes
            # reliable, same rollout pattern as requires_photo_for_export.
            "requires_item_master_validation": _pick("requires_item_master_validation"),
        }

    # ---------------- Audit ----------------

    async def _audit(
        self,
        action: str,
        current_user: dict[str, Any],
        *,
        after: dict[str, Any],
        before: dict[str, Any] | None = None,
    ) -> None:
        try:
            from backend.models.audit import AuditEventType
            from backend.services.audit_service import AuditService

            entity_id = str(after.get("mapping_id") or after.get("item_code") or "")
            await AuditService(self.db).log_event(
                event_type=AuditEventType.EXPORT_MAPPING_CHANGED,
                actor_id=current_user.get("username"),
                actor_username=current_user.get("username"),
                actor_role=current_user.get("role"),
                entity_type="erpnext_export_setting",
                entity_id=entity_id,
                before=_strip_id(before),
                after=_strip_id(after),
                details={"action": action},
            )
        except Exception as exc:  # pragma: no cover - best-effort by contract
            logger.warning("Failed to audit ERPNext export setting change (%s): %s", action, exc)
