import importlib.util
import sys
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "summarize_shadow_logs.py"
SPEC = importlib.util.spec_from_file_location("summarize_shadow_logs", SCRIPT_PATH)
shadow_log_summary = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = shadow_log_summary
SPEC.loader.exec_module(shadow_log_summary)


def test_summarize_shadow_logs_deduplicates_json_events_by_shadow_id():
    lines = [
        (
            '{"message":"shadow_compare_started","extra":{"shadow_id":"abc123",'
            '"endpoint":"dashboard.stats","request_id":"req1","params_hash":"p1"}}'
        ),
        (
            '{"message":"shadow_compare","extra":{"shadow_id":"abc123",'
            '"endpoint":"dashboard.stats","status":"matched"}}'
        ),
    ]

    summary = shadow_log_summary.summarize_lines(lines)

    assert summary["total"] == 1
    assert summary["mismatch_count"] == 0
    assert summary["endpoints"]["dashboard.stats"]["total"] == 1


def test_summarize_shadow_logs_counts_text_mismatches_and_timeouts():
    lines = [
        (
            "shadow_compare shadow_id=s1 endpoint=report.variance "
            "params_hash=p1 status=mismatch"
        ),
        (
            "shadow_compare_mismatch shadow_id=s1 endpoint=report.variance "
            "params_hash=p1 {'items_diff': [{'key': 'item_code:A'}]}"
        ),
        "shadow_compare_failed shadow_id=s2 endpoint=report.variance error_type=timeout",
    ]

    summary = shadow_log_summary.summarize_lines(lines)

    assert summary["total"] == 2
    assert summary["mismatch_count"] == 1
    assert summary["timeout_count"] == 1
    assert summary["endpoints"]["report.variance"] == {
        "total": 2,
        "mismatch": 1,
        "timeout": 1,
        "error": 0,
    }


def test_shadow_threshold_decision_requires_data_and_clean_rates():
    clean = {"total": 10, "mismatch_rate": 0.0, "timeout_rate": 0.0, "error_rate": 0.0}
    empty = {"total": 0, "mismatch_rate": 0.0, "timeout_rate": 0.0, "error_rate": 0.0}
    noisy = {"total": 10, "mismatch_rate": 0.1, "timeout_rate": 0.0, "error_rate": 0.0}

    assert shadow_log_summary._passes_thresholds(
        clean,
        max_mismatch_rate=0.001,
        max_timeout_rate=0.01,
        max_error_rate=0.0,
    )
    assert not shadow_log_summary._passes_thresholds(
        empty,
        max_mismatch_rate=0.001,
        max_timeout_rate=0.01,
        max_error_rate=0.0,
    )
    assert not shadow_log_summary._passes_thresholds(
        noisy,
        max_mismatch_rate=0.001,
        max_timeout_rate=0.01,
        max_error_rate=0.0,
    )
