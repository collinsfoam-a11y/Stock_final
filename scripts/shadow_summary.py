#!/usr/bin/env python3
"""Compatibility entrypoint for the shadow-read log summarizer."""

from __future__ import annotations

from summarize_shadow_logs import main


if __name__ == "__main__":
    raise SystemExit(main())
