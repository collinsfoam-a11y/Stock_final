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
    index_file = frontend_dist / "index.html"
    if not index_file.exists():
        logger.warning(
            f"Frontend index not found at {index_file}. SPA fallback route was not mounted."
        )
        return

    logger.info(f"Serving frontend from {frontend_dist}")

    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
    else:
        logger.warning(
            f"Frontend assets not found at {assets_dir}. Static asset routes were not mounted."
        )

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

        if not index_file.exists():
            logger.warning(f"Frontend index disappeared at {index_file}. Cannot serve SPA fallback.")
            raise HTTPException(status_code=404, detail="Frontend build not available")

        return FileResponse(index_file)
