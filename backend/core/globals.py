from typing import Any

# Global service instances
# These are initialized during the lifespan startup event
scheduled_export_service: Any | None = None
sync_conflicts_service: Any | None = None
monitoring_service: Any | None = None
database_health_service: Any | None = None
auto_sync_manager: Any | None = None
sql_sync_service: Any | None = None
connection_pool: Any | None = None
enterprise_router: Any | None = None
init_enrichment_api: Any | None = None
enrichment_router: Any | None = None

# Constants
ENTERPRISE_AVAILABLE: bool = False

# Core Services
db: Any | None = None
cache_service: Any | None = None
rate_limiter: Any | None = None
concurrent_handler: Any | None = None
activity_log_service: Any | None = None
error_log_service: Any | None = None
refresh_token_service: Any | None = None
batch_operations: Any | None = None
migration_manager: Any | None = None
websocket_manager: Any | None = None
sql_server_pool: Any | None = None
sql_connector: Any | None = None
pwd_context: Any | None = None
secret_key: Any | None = None
algorithm: Any | None = None

# Enterprise Services (previously app.state)
enterprise_audit_service: Any | None = None
enterprise_security_service: Any | None = None
feature_flag_service: Any | None = None
data_governance_service: Any | None = None
