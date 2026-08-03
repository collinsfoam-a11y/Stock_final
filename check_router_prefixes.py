import os
import re

router_map = {
    "mapping_router": "backend/api/mapping_api.py",
    "search_router": "backend/api/search_api.py",
    "security_router": "backend/api/security_api.py",
    "verification_router": "backend/api/item_verification_api.py",
    "admin_control_router": "backend/api/admin_control_api.py",
    "dynamic_fields_router": "backend/api/dynamic_fields_api.py",
    "dynamic_reports_router": "backend/api/dynamic_reports_api.py",
    "master_settings_router": "backend/api/master_settings_api.py",
    "service_logs_router": "backend/api/service_logs_api.py",
    "locations_router": "backend/api/locations_api.py",
    "sync_batch_router": "backend/api/sync_batch_api.py",
    "unknown_items_router": "backend/api/unknown_items_api.py",
    "rack_router": "backend/api/rack_api.py",
    "session_mgmt_router": "backend/api/session_management_api.py",
    "user_settings_router": "backend/api/user_settings_api.py",
    "reporting_router": "backend/api/reporting_api.py",
    "error_reporting_router": "backend/api/error_reporting_api.py",
    "websocket_router": "backend/api/websocket_api.py",
    "sql_verification_router": "backend/api/sql_verification_api.py",
    "enhanced_item_router": "backend/api/enhanced_item_api.py",
    "pi_router": "backend/api/pi_api.py",
    "notifications_router": "backend/api/notifications_api.py"
}

for name, path in router_map.items():
    if os.path.exists(path):
        with open(path, 'r') as f:
            content = f.read()
            match = re.search(r'APIRouter\([^)]*prefix=["\']([^"\']+)["\']', content)
            if match:
                prefix = match.group(1)
                print(f"{name}: {prefix}")
            else:
                print(f"{name}: NO PREFIX FOUND")
    else:
        print(f"{name}: FILE NOT FOUND")
