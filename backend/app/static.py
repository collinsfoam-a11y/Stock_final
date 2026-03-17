"""Static frontend serving registration."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


def register_static_serving(app: FastAPI, frontend_dist: Path, logger: Any) -> None:
    """Register static serving routes for single-executable/frontend mode."""
    if not frontend_dist.exists():
        logger.warning(
            f"Frontend dist not found at {frontend_dist}. Run 'npm run build:web' in frontend/."
        )
        return

    logger.info(f"Serving frontend from {frontend_dist}")

    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

    for folder in ["static", "fonts", "images"]:
        if (frontend_dist / folder).exists():
            app.mount(f"/{folder}", StaticFiles(directory=str(frontend_dist / folder)), name=folder)

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if (
            full_path.startswith("api/")
            or full_path.startswith("docs")
            or full_path.startswith("openapi.json")
        ):
            raise HTTPException(status_code=404, detail="Not Found")

        if ".." in full_path:
            raise HTTPException(status_code=404, detail="Not Found")

        file_path = frontend_dist / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)

        return FileResponse(frontend_dist / "index.html")
