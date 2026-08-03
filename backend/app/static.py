"""Static frontend serving registration."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


def register_static_serving(app: FastAPI, frontend_dist: Path, logger: Any) -> None:
    """Register static serving routes for single-executable/frontend mode."""
    if not frontend_dist.exists() or not frontend_dist.is_dir():
        logger.warning(
            f"Frontend dist not found at {frontend_dist}. Run 'npm run build:web' in frontend/."
        )
        return

    logger.info(f"Serving frontend from {frontend_dist}")

    assets_dir = frontend_dist / "assets"
    if assets_dir.exists() and assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    for folder in ["static", "fonts", "images"]:
        folder_dir = frontend_dist / folder
        if folder_dir.exists() and folder_dir.is_dir():
            app.mount(f"/{folder}", StaticFiles(directory=str(folder_dir)), name=folder)

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if (
            full_path.startswith(("api/", "docs", "openapi.json"))
        ):
            raise HTTPException(status_code=404, detail="Not Found")

        if ".." in full_path:
            raise HTTPException(status_code=404, detail="Not Found")

        file_path = frontend_dist / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)

        index_file = frontend_dist / "index.html"
        if index_file.exists() and index_file.is_file():
            return FileResponse(index_file)

        raise HTTPException(status_code=404, detail="Frontend index.html not found")
