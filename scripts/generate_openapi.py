import json
import sys
import os
from pathlib import Path

# Add backend to sys.path so we can import from it
sys.path.insert(0, str(Path(__file__).parent.parent))

# Ensure required environment variables for generating OpenAPI schema
os.environ.setdefault("JWT_SECRET", "ci-generate-openapi-secret-key-32chars")
os.environ.setdefault("JWT_REFRESH_SECRET", "ci-generate-openapi-refresh-key-32")

from backend.app_factory import app

def main():
    openapi_schema = app.openapi()
    
    out_path = Path(__file__).parent.parent / "openapi.json"
    with open(out_path, "w") as f:
        json.dump(openapi_schema, f, indent=2)
    
    print(f"Generated OpenAPI schema at {out_path}")

if __name__ == "__main__":
    main()
