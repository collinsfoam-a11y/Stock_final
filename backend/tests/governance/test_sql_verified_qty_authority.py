import os
import tokenize

import pytest


ALLOWED_RELATIVE = {
    "services/sql_verification_service.py",
    "api/schemas.py",
    "api/v2/items.py",
}


def iter_python_files(root_dir: str):
    for dirpath, _, filenames in os.walk(root_dir):
        if any(
            skip in dirpath
            for skip in ("tests", "__pycache__", ".venv", "dist", "build", "coverage")
        ):
            continue
        for filename in filenames:
            if filename.endswith(".py"):
                yield os.path.join(dirpath, filename)


def contains_sql_verified_qty_token(path: str) -> bool:
    with open(path, "rb") as handle:
        tokens = tokenize.tokenize(handle.readline)
        for token in tokens:
            if token.string == "sql_verified_qty":
                return True
    return False


@pytest.mark.governance
def test_sql_verified_qty_authority():
    """
    CONTRACT: Only SQLVerificationService (plus schema/DTOs) may reference sql_verified_qty.
    """
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    violations = []
    for file_path in iter_python_files(backend_dir):
        relative = os.path.relpath(file_path, backend_dir).replace("\\", "/")
        if relative in ALLOWED_RELATIVE:
            continue
        if contains_sql_verified_qty_token(file_path):
            violations.append(relative)

    assert not violations, (
        "Governance Violation: Unauthorized sql_verified_qty usage found in:\n"
        + "\n".join(sorted(violations))
    )
