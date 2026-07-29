import json
import os
from pathlib import Path
from backend.config import settings

def test_config_snapshot():
    """Ensure the configuration schema remains stable and backward-compatible.
    
    This snapshot test dumps the Pydantic schema of the settings tree and compares
    it against a committed baseline. If the schema changes (fields added, removed, 
    or types changed), this test will fail.
    
    To update the snapshot intentionally, run:
    UPDATE_SNAPSHOTS=1 pytest backend/tests/test_config_snapshot.py
    """
    
    schema = settings.model_json_schema()
    
    # Sort keys for deterministic output
    def _sort_dict(d):
        if not isinstance(d, dict):
            return d
        return {k: _sort_dict(v) for k, v in sorted(d.items())}
        
    sorted_schema = _sort_dict(schema)
    
    snapshot_dir = Path(__file__).parent / "snapshots"
    snapshot_path = snapshot_dir / "config_baseline.json"
    
    if os.environ.get("UPDATE_SNAPSHOTS") == "1" or not snapshot_path.exists():
        snapshot_dir.mkdir(parents=True, exist_ok=True)
        with open(snapshot_path, "w") as f:
            json.dump(sorted_schema, f, indent=2)
        print(f"Generated config snapshot at {snapshot_path}")
        return
        
    with open(snapshot_path, "r") as f:
        baseline = json.load(f)
        
    assert sorted_schema == baseline, "Configuration schema has changed! If intentional, run with UPDATE_SNAPSHOTS=1"
