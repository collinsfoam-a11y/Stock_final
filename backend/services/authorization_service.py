"""
Authorization Service
Enforces backend authorization for protected endpoints
"""

import logging
from enum import Enum

from fastapi import HTTPException

logger = logging.getLogger(__name__)


class Permission(Enum):
    """Define all possible permissions in the system"""
    # Session management
    SESSION_CREATE = "session:create"
    SESSION_READ = "session:read"
    SESSION_UPDATE = "session:update"
    SESSION_DELETE = "session:delete"
    
    # Count line management
    COUNT_LINE_CREATE = "count_line:create"
    COUNT_LINE_READ = "count_line:read"
    COUNT_LINE_UPDATE = "count_line:update"
    COUNT_LINE_DELETE = "count_line:delete"
    
    # Inventory adjustments
    INVENTORY_ADJUST = "inventory:adjust"
    INVENTORY_APPROVE = "inventory:approve"
    INVENTORY_REJECT = "inventory:reject"
    
    # Reports and analytics
    REPORT_GENERATE = "report:generate"
    REPORT_VIEW = "report:view"
    
    # User management
    USER_MANAGE = "user:manage"
    USER_READ = "user:read"
    
    # Admin functions
    ADMIN_ACCESS = "admin:access"
    SUPERVISOR_ACCESS = "supervisor:access"
    
    # System settings
    SYSTEM_SETTINGS_READ = "settings:read"
    SYSTEM_SETTINGS_WRITE = "settings:write"


class AuthorizationService:
    """Service to handle role-based access control"""
    
    # Define role-based permissions
    ROLE_PERMISSIONS: dict[str, set[Permission]] = {
        "admin": {
            Permission.SESSION_CREATE, Permission.SESSION_READ, Permission.SESSION_UPDATE, Permission.SESSION_DELETE,
            Permission.COUNT_LINE_CREATE, Permission.COUNT_LINE_READ, Permission.COUNT_LINE_UPDATE, Permission.COUNT_LINE_DELETE,
            Permission.INVENTORY_ADJUST, Permission.INVENTORY_APPROVE, Permission.INVENTORY_REJECT,
            Permission.REPORT_GENERATE, Permission.REPORT_VIEW,
            Permission.USER_MANAGE, Permission.USER_READ,
            Permission.ADMIN_ACCESS, Permission.SUPERVISOR_ACCESS,
            Permission.SYSTEM_SETTINGS_READ, Permission.SYSTEM_SETTINGS_WRITE,
        },
        "supervisor": {
            Permission.SESSION_CREATE, Permission.SESSION_READ, Permission.SESSION_UPDATE,
            Permission.COUNT_LINE_CREATE, Permission.COUNT_LINE_READ, Permission.COUNT_LINE_UPDATE,
            Permission.INVENTORY_ADJUST, Permission.INVENTORY_APPROVE, Permission.INVENTORY_REJECT,
            Permission.REPORT_GENERATE, Permission.REPORT_VIEW,
            Permission.SUPERVISOR_ACCESS,
            Permission.SYSTEM_SETTINGS_READ,
        },
        "staff": {
            Permission.SESSION_READ,
            Permission.COUNT_LINE_CREATE, Permission.COUNT_LINE_READ,
            Permission.REPORT_VIEW,
        }
    }
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
    
    def has_permission(self, user: dict, permission: Permission) -> bool:
        """
        Check if user has specific permission
        
        Args:
            user: User object containing role information
            permission: Permission to check
            
        Returns:
            Boolean indicating if user has permission
        """
        user_role = user.get("role", "anonymous").lower()
        
        # Check if the user's role has the required permission
        role_permissions = self.ROLE_PERMISSIONS.get(user_role, set())
        return permission in role_permissions
    
    def authorize(self, user: dict, permission: Permission, resource: str | None = None) -> bool:
        """
        Authorize user for specific permission and optionally resource
        
        Args:
            user: User object containing role information
            permission: Permission to check
            resource: Optional resource identifier for fine-grained control
            
        Returns:
            Boolean indicating if user is authorized
            
        Raises:
            HTTPException: If user is not authorized
        """
        if not self.has_permission(user, permission):
            self.logger.warning(
                f"Authorization failed for user {user.get('username', 'unknown')} "
                f"attempting {permission.value} on {resource or 'resource'}"
            )
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to perform this action."
            )
        
        # Additional resource-level checks could go here
        if resource:
            # Example: Check if user can access specific resource
            # This would involve checking ownership, tenant isolation, etc.
            pass
        
        return True
    
    def authorize_admin(self, user: dict) -> bool:
        """Authorize admin access"""
        return self.authorize(user, Permission.ADMIN_ACCESS)
    
    def authorize_supervisor(self, user: dict) -> bool:
        """Authorize supervisor access"""
        return self.authorize(user, Permission.SUPERVISOR_ACCESS)
    
    def authorize_session_create(self, user: dict) -> bool:
        """Authorize session creation"""
        return self.authorize(user, Permission.SESSION_CREATE)
    
    def authorize_count_line_modify(self, user: dict) -> bool:
        """Authorize count line modification"""
        return self.authorize(user, Permission.COUNT_LINE_UPDATE)
    
    def authorize_inventory_adjust(self, user: dict) -> bool:
        """Authorize inventory adjustment"""
        return self.authorize(user, Permission.INVENTORY_ADJUST)
    
    def authorize_inventory_approve(self, user: dict) -> bool:
        """Authorize inventory approval"""
        return self.authorize(user, Permission.INVENTORY_APPROVE)
    
    def authorize_report_generation(self, user: dict) -> bool:
        """Authorize report generation"""
        return self.authorize(user, Permission.REPORT_GENERATE)
    
    def get_user_permissions(self, user: dict) -> list[str]:
        """Get all permissions for a user"""
        user_role = user.get("role", "anonymous").lower()
        permissions = self.ROLE_PERMISSIONS.get(user_role, set())
        return [perm.value for perm in permissions]
    
    def check_user_role(self, user: dict, required_role: str) -> bool:
        """
        Check if user has a specific role
        
        Args:
            user: User object
            required_role: Required role name
            
        Returns:
            Boolean indicating if user has required role
        """
        user_role = user.get("role", "anonymous").lower()
        required_role_lower = required_role.lower()
        
        # Handle hierarchical roles (admin > supervisor > staff)
        if required_role_lower == "admin":
            return user_role == "admin"
        elif required_role_lower == "supervisor":
            return user_role in ["admin", "supervisor"]
        elif required_role_lower == "staff":
            return user_role in ["admin", "supervisor", "staff"]
        else:
            return user_role == required_role_lower


# Global instance
auth_service = AuthorizationService()


# Decorator for easy authorization in route handlers
def require_permission(permission: Permission):
    """
    Decorator to require specific permission for route handlers
    
    Usage:
    @router.get("/some-endpoint")
    async def some_endpoint(user: dict = Depends(get_current_user)):
        require_permission(Permission.REPORT_VIEW)(user)
        # ... rest of handler
    """
    def decorator(user: dict):
        auth_service.authorize(user, permission)
        return True
    return decorator


def require_role(required_role: str):
    """
    Decorator to require specific role for route handlers
    """
    def decorator(user: dict):
        if not auth_service.check_user_role(user, required_role):
            raise HTTPException(
                status_code=403,
                detail=f"This action requires {required_role} role."
            )
        return True
    return decorator