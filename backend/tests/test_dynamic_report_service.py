from backend.services.dynamic_report_service import DynamicReportService


class _FakeDB:
    def __init__(self):
        self.report_templates = object()
        self.generated_reports = object()


def test_generate_pdf_returns_real_pdf_bytes():
    service = DynamicReportService(_FakeDB())

    file_data, file_name, mime_type = service._generate_pdf(
        data=[{"item_code": "ITEM-1", "counted_qty": 5}],
        template_name="Variance Report",
        timestamp="20260315_100000",
        fields=[
            {"name": "item_code", "label": "Item Code"},
            {"name": "counted_qty", "label": "Counted Qty"},
        ],
    )

    assert mime_type == "application/pdf"
    assert file_name.endswith(".pdf")
    assert file_data.startswith(b"%PDF")
