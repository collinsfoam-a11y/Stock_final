import json
import sys
from pathlib import Path

# Add the project root to sys.path so we can import backend
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from backend.app_factory import app

def main():
    openapi_schema = app.openapi()
    output_path = project_root / "frontend" / "openapi.json"
    with open(output_path, "w") as f:
        json.dump(openapi_schema, f, indent=2)
    print(f"OpenAPI schema exported to {output_path}")

if __name__ == "__main__":
    main()
