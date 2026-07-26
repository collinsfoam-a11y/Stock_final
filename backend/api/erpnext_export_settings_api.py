"""ERPNext export settings API (BSR): admin-only maintenance of warehouse
mappings, UOM mappings, and item export-control flags used by
POST /api/erpnext-exports/preview to replace inference-based blockers.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from backend.auth.dependencies import require_admin
from backend.db.runtime import get_db
from backend.services.erpnext_export_settings_service import (
    ErpNextExportSettingsError,
    ErpNextExportSettingsService,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/erpnext-export-settings", tags=["ERPNext Export Settings"])


def _service() -> ErpNextExportSettingsService:
    return ErpNextExportSettingsService(get_db())


class WarehouseMappingCreate(BaseModel):
    stock_verify_warehouse_id: str
    stock_verify_warehouse_name: str
    erpnext_warehouse: str
    company: str


class WarehouseMappingUpdate(BaseModel):
    stock_verify_warehouse_name: Optional[str] = None
    erpnext_warehouse: Optional[str] = None
    is_active: Optional[bool] = None


class UomMappingCreate(BaseModel):
    stock_verify_uom: str
    erpnext_uom: str
    conversion_factor: float = 1.0


class UomMappingUpdate(BaseModel):
    erpnext_uom: Optional[str] = None
    conversion_factor: Optional[float] = None
    is_active: Optional[bool] = None


class ItemExportFlagsCreate(BaseModel):
    item_code: str
    is_serialized: Optional[bool] = None
    is_batch_controlled: Optional[bool] = None
    allow_negative_opening_qty: Optional[bool] = None
    requires_photo_for_export: Optional[bool] = None


class ItemExportFlagsUpdate(BaseModel):
    is_serialized: Optional[bool] = None
    is_batch_controlled: Optional[bool] = None
    allow_negative_opening_qty: Optional[bool] = None
    requires_photo_for_export: Optional[bool] = None


@router.post("/warehouse-mappings")
async def create_warehouse_mapping(
    payload: WarehouseMappingCreate,
    current_user: dict = Depends(require_admin),
):
    try:
        return await _service().create_warehouse_mapping(
            stock_verify_warehouse_id=payload.stock_verify_warehouse_id,
            stock_verify_warehouse_name=payload.stock_verify_warehouse_name,
            erpnext_warehouse=payload.erpnext_warehouse,
            company=payload.company,
            current_user=current_user,
        )
    except ErpNextExportSettingsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/warehouse-mappings")
async def list_warehouse_mappings(
    active_only: bool = Query(False),
    current_user: dict = Depends(require_admin),
):
    return await _service().list_warehouse_mappings(active_only=active_only)


@router.patch("/warehouse-mappings/{mapping_id}")
async def update_warehouse_mapping(
    mapping_id: str,
    payload: WarehouseMappingUpdate,
    current_user: dict = Depends(require_admin),
):
    try:
        return await _service().update_warehouse_mapping(
            mapping_id,
            updates=payload.model_dump(exclude_unset=True),
            current_user=current_user,
        )
    except ErpNextExportSettingsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/uom-mappings")
async def create_uom_mapping(
    payload: UomMappingCreate,
    current_user: dict = Depends(require_admin),
):
    try:
        return await _service().create_uom_mapping(
            stock_verify_uom=payload.stock_verify_uom,
            erpnext_uom=payload.erpnext_uom,
            conversion_factor=payload.conversion_factor,
            current_user=current_user,
        )
    except ErpNextExportSettingsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/uom-mappings")
async def list_uom_mappings(
    active_only: bool = Query(False),
    current_user: dict = Depends(require_admin),
):
    return await _service().list_uom_mappings(active_only=active_only)


@router.patch("/uom-mappings/{mapping_id}")
async def update_uom_mapping(
    mapping_id: str,
    payload: UomMappingUpdate,
    current_user: dict = Depends(require_admin),
):
    try:
        return await _service().update_uom_mapping(
            mapping_id,
            updates=payload.model_dump(exclude_unset=True),
            current_user=current_user,
        )
    except ErpNextExportSettingsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/item-flags")
async def create_item_flags(
    payload: ItemExportFlagsCreate,
    current_user: dict = Depends(require_admin),
):
    try:
        return await _service().upsert_item_flags(
            payload.item_code,
            updates=payload.model_dump(exclude={"item_code"}, exclude_unset=True),
            current_user=current_user,
        )
    except ErpNextExportSettingsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/item-flags/{item_code}")
async def get_item_flags(
    item_code: str,
    current_user: dict = Depends(require_admin),
):
    doc = await _service().get_item_flags(item_code)
    if doc is None:
        raise HTTPException(
            status_code=404, detail=f"No item export flags configured for {item_code!r}"
        )
    return doc


@router.patch("/item-flags/{item_code}")
async def update_item_flags(
    item_code: str,
    payload: ItemExportFlagsUpdate,
    current_user: dict = Depends(require_admin),
):
    try:
        return await _service().upsert_item_flags(
            item_code,
            updates=payload.model_dump(exclude_unset=True),
            current_user=current_user,
        )
    except ErpNextExportSettingsError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
