from __future__ import annotations

from typing import Any, Optional

from fastapi import Request

from backend.services.enterprise_audit import AuditEventType, AuditSeverity


async def log_enterprise_audit(
    request: Optional[Request],
    *,
    event_type: AuditEventType,
    action: str,
    current_user: Optional[dict[str, Any]] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    resource_name: Optional[str] = None,
    outcome: str = "success",
    severity: AuditSeverity = AuditSeverity.INFO,
    details: Optional[dict[str, Any]] = None,
    old_value: Optional[dict[str, Any]] = None,
    new_value: Optional[dict[str, Any]] = None,
    correlation_id: Optional[str] = None,
    session_id: Optional[str] = None,
    request_id: Optional[str] = None,
) -> str:
    if request is None:
        return ""
    audit_service = getattr(request.app.state, "enterprise_audit", None)
    if audit_service is None:
        return ""

    actor_username = (current_user or {}).get("username")
    actor_role = (current_user or {}).get("role")
    actor_id = (current_user or {}).get("id")
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    return await audit_service.log(
        event_type=event_type,
        action=action,
        actor_id=str(actor_id) if actor_id is not None else None,
        actor_username=str(actor_username) if actor_username is not None else None,
        actor_role=str(actor_role) if actor_role is not None else None,
        actor_ip=str(ip) if ip is not None else None,
        actor_user_agent=str(user_agent) if user_agent is not None else None,
        resource_type=resource_type,
        resource_id=resource_id,
        resource_name=resource_name,
        outcome=outcome,
        severity=severity,
        details=details or {},
        old_value=old_value,
        new_value=new_value,
        correlation_id=correlation_id,
        session_id=session_id,
        request_id=request_id,
    )
