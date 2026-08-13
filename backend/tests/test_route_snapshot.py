import json
import os
from pathlib import Path
from backend.app_factory import app
from fastapi.routing import APIRoute

def test_route_snapshot():
    routes = []
    for route in app.routes:
        if isinstance(route, APIRoute):
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
        
    # Ignore "serve_spa" during comparison to prevent failure when frontend is not built in CI
    routes = [r for r in routes if r["name"] != "serve_spa"]
    baseline = [b for b in baseline if b["name"] != "serve_spa"]

    assert routes == baseline, "Routes have changed! If intentional, run with UPDATE_SNAPSHOTS=1"
