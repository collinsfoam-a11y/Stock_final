"""Publish projection readiness using the packaged publisher entrypoint."""

from __future__ import annotations

import os
import subprocess  # nosec B404
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
PYC_PATH = (
    ROOT_DIR
    / "backend"
    / "scripts"
    / "__pycache__"
    / "publish_projection_readiness.cpython-311.pyc"
)


def _absolutize_path(value: str) -> str:
    path = Path(value)
    return str(path if path.is_absolute() else ROOT_DIR / path)


def main() -> int:
    args = list(sys.argv[1:])
    if args and not args[0].startswith("-"):
        args[0] = _absolutize_path(args[0])
    if "--output" in args:
        idx = args.index("--output")
        if idx + 1 < len(args):
            args[idx + 1] = _absolutize_path(args[idx + 1])
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT_DIR)
    completed = subprocess.run([sys.executable, str(PYC_PATH), *args], cwd=str(ROOT_DIR), env=env)  # nosec B603
    return int(completed.returncode)


if __name__ == "__main__":
    raise SystemExit(main())
