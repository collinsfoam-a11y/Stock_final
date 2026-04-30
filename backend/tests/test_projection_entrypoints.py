from __future__ import annotations

from pathlib import Path


PROJECTION_COLLECTION_LITERALS = {
    "session_dashboard_projection",
    "verified_items_projection",
    "variance_summary_projection",
    "financial_projection",
    "batch_records",
}

ALLOWED_SOURCE_FILES = {
    Path("backend/services/projection_read_service.py"),
    Path("backend/services/projection_status_store.py"),
}


def test_projection_collection_access_is_centralized() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    scanned_roots = [repo_root / "backend/api", repo_root / "backend/services"]
    violations: list[str] = []

    for root in scanned_roots:
        for path in root.rglob("*.py"):
            relative = path.relative_to(repo_root)
            if relative in ALLOWED_SOURCE_FILES:
                continue
            text = path.read_text(encoding="utf-8")
            for collection_name in PROJECTION_COLLECTION_LITERALS:
                if f'"{collection_name}"' in text or f"'{collection_name}'" in text:
                    violations.append(f"{relative}: {collection_name}")

    assert violations == []


def test_projection_readiness_state_reads_are_centralized() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    scanned_roots = [repo_root / "backend/api", repo_root / "backend/services"]
    allowed = {Path("backend/services/projection_status_store.py")}
    violations: list[str] = []

    for root in scanned_roots:
        for path in root.rglob("*.py"):
            relative = path.relative_to(repo_root)
            if relative in allowed:
                continue
            text = path.read_text(encoding="utf-8")
            if '"projection_readiness"' in text or "'projection_readiness'" in text:
                violations.append(str(relative))
            if "PROJECTION_READINESS_COLLECTION" in text:
                violations.append(str(relative))

    assert violations == []
