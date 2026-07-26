"""
Tests for ERPNext official import-template validation (BSR Step 10):
compares Stock Verify's generated headers against a template actually
downloaded from the target ERPNext instance, never fakes a result when no
template exists, and never talks to ERPNext.
"""

import json

from backend.services.erpnext_template_validation_service import ErpNextTemplateValidationService


def _write_manifest(tmp_path, templates: dict, *, erpnext_version="v14.x") -> None:
    manifest = {
        "erpnext_version": erpnext_version,
        "frappe_version": "v14.x",
        "company": "Acme Retail Pvt Ltd",
        "downloaded_at": "2026-07-09T00:00:00Z",
        "downloaded_by": "ops1",
        "source_instance": "staging",
        "templates": templates,
    }
    (tmp_path / "template_manifest.json").write_text(json.dumps(manifest))


def _write_csv(tmp_path, filename: str, headers: list[str]) -> None:
    (tmp_path / filename).write_text(",".join(headers) + "\n")


def test_missing_template_returns_source_missing(tmp_path):
    # No manifest at all in this directory.
    service = ErpNextTemplateValidationService(template_dir=tmp_path)

    result = service.validate(
        file_type="stock_entry", file_format="csv", stock_verify_headers=["Item Code", "Qty"]
    )

    assert result["valid"] is False
    assert result["template_available"] is False
    assert result["source"] == "STOCK_VERIFY_INTERNAL_SPEC"
    codes = [e["code"] for e in result["errors"]]
    assert "ERP_TEMPLATE_MANIFEST_MISSING" in codes


def test_manifest_present_but_template_file_missing_returns_source_missing(tmp_path):
    _write_manifest(
        tmp_path,
        {
            "stock_entry": {
                "file": "stock_entry_template.csv",
                "doctype": "Stock Entry",
                "has_child_table": True,
                "child_table_name": "items",
            }
        },
    )
    # Note: stock_entry_template.csv is intentionally never written.
    service = ErpNextTemplateValidationService(template_dir=tmp_path)

    result = service.validate(
        file_type="stock_entry", file_format="csv", stock_verify_headers=["Item Code", "Qty"]
    )

    assert result["valid"] is False
    codes = [e["code"] for e in result["errors"]]
    assert "ERP_TEMPLATE_SOURCE_MISSING" in codes


def test_missing_erpnext_version_returns_version_unknown(tmp_path):
    _write_manifest(
        tmp_path,
        {"stock_entry": {"file": "stock_entry_template.csv", "doctype": "Stock Entry"}},
        erpnext_version="",
    )
    _write_csv(tmp_path, "stock_entry_template.csv", ["Item Code", "Qty"])
    service = ErpNextTemplateValidationService(template_dir=tmp_path)

    result = service.validate(
        file_type="stock_entry", file_format="csv", stock_verify_headers=["Item Code", "Qty"]
    )

    codes = [e["code"] for e in result["errors"]]
    assert "ERP_VERSION_UNKNOWN" in codes


def test_matching_template_passes(tmp_path):
    _write_manifest(
        tmp_path,
        {
            "stock_entry": {
                "file": "stock_entry_template.csv",
                "doctype": "Stock Entry",
                "has_child_table": True,
                "child_table_name": "items",
            }
        },
    )
    _write_csv(tmp_path, "stock_entry_template.csv", ["Item Code", "Qty", "UOM"])
    service = ErpNextTemplateValidationService(template_dir=tmp_path)

    result = service.validate(
        file_type="stock_entry", file_format="csv", stock_verify_headers=["Item Code", "Qty", "UOM"]
    )

    assert result["valid"] is True
    assert result["template_available"] is True
    assert result["source"] == "ERP_NEXT_TEMPLATE"
    assert result["errors"] == []
    assert result["missing_columns"] == []
    assert result["extra_columns"] == []


def test_missing_mandatory_template_column_fails(tmp_path):
    _write_manifest(
        tmp_path,
        {"stock_entry": {"file": "stock_entry_template.csv", "doctype": "Stock Entry"}},
    )
    _write_csv(tmp_path, "stock_entry_template.csv", ["Item Code", "Qty", "UOM", "Company"])
    service = ErpNextTemplateValidationService(template_dir=tmp_path)

    result = service.validate(
        file_type="stock_entry", file_format="csv", stock_verify_headers=["Item Code", "Qty", "UOM"]
    )

    assert result["valid"] is False
    assert "Company" in result["missing_columns"]
    codes = [e["code"] for e in result["errors"]]
    assert "ERP_TEMPLATE_MISSING_COLUMNS" in codes


def test_case_mismatch_fails(tmp_path):
    _write_manifest(
        tmp_path,
        {"stock_entry": {"file": "stock_entry_template.csv", "doctype": "Stock Entry"}},
    )
    _write_csv(tmp_path, "stock_entry_template.csv", ["Item Code", "UOM", "Company"])
    service = ErpNextTemplateValidationService(template_dir=tmp_path)

    result = service.validate(
        file_type="stock_entry",
        file_format="csv",
        stock_verify_headers=["item code", "UOM", "Company"],  # lowercase "item code"
    )

    assert result["valid"] is False
    codes = [e["code"] for e in result["errors"]]
    assert "ERP_TEMPLATE_CASE_MISMATCH" in codes
    assert any(m["erpnext"] == "Item Code" for m in result["case_mismatches"])


def test_extra_uom_conversion_factor_column_warns_by_default(tmp_path):
    _write_manifest(
        tmp_path,
        {"stock_entry": {"file": "stock_entry_template.csv", "doctype": "Stock Entry"}},
    )
    _write_csv(tmp_path, "stock_entry_template.csv", ["Item Code", "Qty", "UOM"])
    service = ErpNextTemplateValidationService(template_dir=tmp_path, strict=False)

    result = service.validate(
        file_type="stock_entry",
        file_format="csv",
        stock_verify_headers=["Item Code", "Qty", "UOM", "UOM Conversion Factor"],
    )

    assert result["valid"] is True  # extra column is a warning, not a failure, by default
    assert "UOM Conversion Factor" in result["extra_columns"]
    assert any("UOM Conversion Factor" in w for w in result["warnings"])


def test_extra_uom_conversion_factor_column_fails_in_strict_mode(tmp_path):
    _write_manifest(
        tmp_path,
        {"stock_entry": {"file": "stock_entry_template.csv", "doctype": "Stock Entry"}},
    )
    _write_csv(tmp_path, "stock_entry_template.csv", ["Item Code", "Qty", "UOM"])
    service = ErpNextTemplateValidationService(template_dir=tmp_path, strict=True)

    result = service.validate(
        file_type="stock_entry",
        file_format="csv",
        stock_verify_headers=["Item Code", "Qty", "UOM", "UOM Conversion Factor"],
    )

    assert result["valid"] is False
    codes = [e["code"] for e in result["errors"]]
    assert "ERP_TEMPLATE_EXTRA_COLUMNS_STRICT" in codes


def test_child_table_ambiguity_warns(tmp_path):
    _write_manifest(
        tmp_path,
        {
            "stock_entry": {
                "file": "stock_entry_template.csv",
                "doctype": "Stock Entry",
                "has_child_table": True,
                "child_table_name": "unknown",
            }
        },
    )
    _write_csv(tmp_path, "stock_entry_template.csv", ["Item Code"])
    service = ErpNextTemplateValidationService(template_dir=tmp_path)

    result = service.validate(
        file_type="stock_entry", file_format="csv", stock_verify_headers=["Item Code"]
    )

    assert "CHILD_TABLE_AMBIGUITY" in result["warnings"]


def test_photo_manifest_has_no_erpnext_template_expectation(tmp_path):
    _write_manifest(tmp_path, {})
    service = ErpNextTemplateValidationService(template_dir=tmp_path)

    result = service.validate(
        file_type="photo_manifest", file_format="csv", stock_verify_headers=["Photo ID"]
    )

    codes = [e["code"] for e in result["errors"]]
    assert "ERP_TEMPLATE_SOURCE_MISSING" not in codes


def test_real_docs_erpnext_templates_folder_reports_missing_honestly():
    """The shipped docs/erpnext_templates/ folder has a scaffold manifest
    (all fields explicitly "unknown") but no fabricated template files or
    real version info -- this must report the honest missing-source /
    version-unknown state, not a fake pass."""
    service = ErpNextTemplateValidationService()  # uses the real default dir

    result = service.validate(
        file_type="stock_entry", file_format="csv", stock_verify_headers=["Item Code"]
    )

    assert result["template_available"] is False
    assert result["source"] == "STOCK_VERIFY_INTERNAL_SPEC"
    codes = [e["code"] for e in result["errors"]]
    assert "ERP_VERSION_UNKNOWN" in codes
    assert "ERP_TEMPLATE_SOURCE_MISSING" in codes


def test_real_docs_erpnext_templates_serial_batch_gate_blocks_on_unknown():
    service = ErpNextTemplateValidationService()  # uses the real default dir

    result = service.evaluate_serial_batch_gate([])

    assert result["version_known"] is False
    codes = [b["code"] for b in result["blockers"]]
    assert "ERP_VERSION_UNKNOWN" in codes


def test_explicit_unknown_string_treated_same_as_missing_version(tmp_path):
    _write_manifest(
        tmp_path,
        {"stock_entry": {"file": "stock_entry_template.csv", "doctype": "Stock Entry"}},
        erpnext_version="unknown",
    )
    _write_csv(tmp_path, "stock_entry_template.csv", ["Item Code"])
    service = ErpNextTemplateValidationService(template_dir=tmp_path)

    result = service.validate(
        file_type="stock_entry", file_format="csv", stock_verify_headers=["Item Code"]
    )

    codes = [e["code"] for e in result["errors"]]
    assert "ERP_VERSION_UNKNOWN" in codes


def test_serial_batch_gate_reads_nested_serial_batch_gate_object(tmp_path):
    import json as _json

    (tmp_path / "template_manifest.json").write_text(
        _json.dumps(
            {
                "erpnext_version": "v15.3.0",
                "templates": {},
                "serial_batch_gate": {
                    "uses_serial_batch_bundle": True,
                    "negative_serial_batch_stock_allowed": False,
                    "serial_import_path": "serial_batch_bundle",
                    "batch_import_path": "serial_batch_bundle",
                },
            }
        )
    )
    service = ErpNextTemplateValidationService(template_dir=tmp_path)

    metadata = service.get_target_instance_metadata()

    assert metadata["uses_serial_batch_bundle"] is True
    assert metadata["serial_import_path"] == "serial_batch_bundle"
    assert metadata["batch_import_path"] == "serial_batch_bundle"


def test_serial_batch_gate_blocks_negative_qty_on_v15(tmp_path):
    _write_manifest(tmp_path, {}, erpnext_version="v15.2.1")
    service = ErpNextTemplateValidationService(template_dir=tmp_path)

    result = service.evaluate_serial_batch_gate(
        [
            {
                "item_code": "ITM-1",
                "serial_numbers": ["SN-1"],
                "batch_no": None,
                "erpnext_opening_qty": -2.0,
            }
        ]
    )

    assert result["gate_applies"] is True
    codes = [b["code"] for b in result["blockers"]]
    assert "SERIAL_BATCH_NEGATIVE_QTY_NEEDS_REVIEW" in codes


def test_serial_batch_gate_does_not_block_negative_qty_on_v13(tmp_path):
    _write_manifest(tmp_path, {}, erpnext_version="v13.0.0")
    service = ErpNextTemplateValidationService(template_dir=tmp_path)

    result = service.evaluate_serial_batch_gate(
        [
            {
                "item_code": "ITM-2",
                "serial_numbers": ["SN-1"],
                "batch_no": None,
                "erpnext_opening_qty": -2.0,
            }
        ]
    )

    assert result["gate_applies"] is False
    codes = [b["code"] for b in result["blockers"]]
    assert "SERIAL_BATCH_NEGATIVE_QTY_NEEDS_REVIEW" not in codes
    assert any("NEGATIVE_SERIAL_BATCH_QTY" in w for w in result["warnings"])


def test_serial_batch_gate_applies_when_bundle_flag_true_even_pre_v15(tmp_path):
    manifest_path = tmp_path / "template_manifest.json"
    import json as _json

    manifest_path.write_text(
        _json.dumps(
            {
                "erpnext_version": "v14.9.0",
                "uses_serial_batch_bundle": True,
                "templates": {},
            }
        )
    )
    service = ErpNextTemplateValidationService(template_dir=tmp_path)

    result = service.evaluate_serial_batch_gate(
        [
            {
                "item_code": "ITM-3",
                "serial_numbers": [],
                "batch_no": "BATCH-1",
                "erpnext_opening_qty": -1.0,
            }
        ]
    )

    assert result["gate_applies"] is True
    codes = [b["code"] for b in result["blockers"]]
    assert "SERIAL_BATCH_NEGATIVE_QTY_NEEDS_REVIEW" in codes


def test_serial_batch_gate_blocks_when_version_unknown(tmp_path):
    # No manifest at all -- version is genuinely unknown.
    service = ErpNextTemplateValidationService(template_dir=tmp_path)

    result = service.evaluate_serial_batch_gate([])

    assert result["version_known"] is False
    codes = [b["code"] for b in result["blockers"]]
    assert "ERP_VERSION_UNKNOWN" in codes


def test_serial_batch_gate_never_flags_non_serialized_non_batch_rows(tmp_path):
    _write_manifest(tmp_path, {}, erpnext_version="v15.2.1")
    service = ErpNextTemplateValidationService(template_dir=tmp_path)

    result = service.evaluate_serial_batch_gate(
        [
            {
                "item_code": "ITM-4",
                "serial_numbers": [],
                "batch_no": None,
                "erpnext_opening_qty": -5.0,
            }
        ]
    )

    codes = [b["code"] for b in result["blockers"]]
    assert "SERIAL_BATCH_NEGATIVE_QTY_NEEDS_REVIEW" not in codes
