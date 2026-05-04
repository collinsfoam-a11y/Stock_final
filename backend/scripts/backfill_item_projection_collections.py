"""Rebuild item projection rows from authoritative raw count-line data."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.scripts.projection_rebuild_common import (
    base_parser,
    normalize_scopes,
    run_async,
    run_rebuild,
)

ALLOWED_SCOPES = {"financial_totals"}


def main() -> int:
    parser = base_parser(__doc__ or "")
    args = parser.parse_args()
    scopes = normalize_scopes(args.scope, allowed=ALLOWED_SCOPES)
    return run_async(
        run_rebuild(
            args=args,
            scopes=scopes,
            actor="item_projection_rebuild",
            rebuild_item_projections=True,
            item_projection_scopes={"financial"},
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
