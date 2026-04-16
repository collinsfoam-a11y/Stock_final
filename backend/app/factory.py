"""FastAPI app factory compatibility surface."""

from __future__ import annotations

from fastapi import FastAPI

from backend import app_factory as _app_factory
from backend.app_factory import *  # noqa: F401,F403


def create_app() -> FastAPI:
    return _app_factory.app


app = create_app()
