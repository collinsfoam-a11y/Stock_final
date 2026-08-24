import json
import os
from pathlib import Path
from backend.app_factory import app
from fastapi.routing import APIRoute

def test_route_snapshot():
    routes = []
    for route in app.routes:
        if isinstance(route, APIRoute):
            # Skip serve_spa which depends on frontend build artifacts
            if route.name == "serve_spa" or route.path == "/{full_path:path}":
                continue
            routes.append({
                "path": route.path,
                "name": route.name,
                "methods": sorted(list(route.methods))
            })
    
    # Sort for deterministic comparison
    routes.sort(key=lambda x: (x["path"], x["name"]))
    
    snapshot_path = Path(__file__).parent / "snapshots" / "route_baseline.json"
    
    if os.environ.get("UPDATE_SNAPSHOTS") == "1" or not snapshot_path.exists():
        snapshot_path.parent.mkdir(parents=True, exist_ok=True)
        with open(snapshot_path, "w") as f:
            json.dump(routes, f, indent=2)
        print(f"Generated route snapshot at {snapshot_path}")
        return
        
    with open(snapshot_path, "r") as f:
        baseline = json.load(f)
        
    # Filter out serve_spa from baseline as well for consistency
    baseline = [
        r for r in baseline
        if r.get("name") != "serve_spa" and r.get("path") != "/{full_path:path}"
    ]

    assert routes == baseline, "Routes have changed! If intentional, run with UPDATE_SNAPSHOTS=1"
