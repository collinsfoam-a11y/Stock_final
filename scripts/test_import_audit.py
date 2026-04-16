import sys
from pathlib import Path
import asyncio

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

try:
    from backend.services.audit_service import AuditService, AuditEventType

    print("Successfully imported AuditService")
    print(f"AuditEventType has {len(AuditEventType)} members")
except Exception as e:
    print(f"Failed to import AuditService: {e}")
    import traceback

    traceback.print_exc()
