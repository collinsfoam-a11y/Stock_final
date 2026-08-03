"""
Error Log Service
Tracks and stores application errors, exceptions, and system issues for monitoring
"""

import logging
import re
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase


def _redact_sensitive_data(data: str) -> str:
    """Remove sensitive information from strings before storage."""
    if not data:
        return data
    
    # Redact various types of sensitive information
    patterns = [
        # Passwords, secrets, tokens, keys
        (r'(password|secret|token|key|auth|pin|api_key|access_token|refresh_token)\s*[:=]\s*["\']?[^"\'\s,;]+', r'\1=***REDACTED***'),
        # Phone numbers
        (r'(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', r'***PHONE_NUMBER_REDACTED***'),
        # Email addresses
        (r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', r'***EMAIL_REDACTED***'),
        # Credit card numbers
        (r'\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b', r'***CREDIT_CARD_REDACTED***'),
        # SSNs and similar
        (r'\b\d{3}-\d{2}-\d{4}\b', r'***SSN_REDACTED***'),
        # File paths (especially user paths)
        (r'/Users/[^/]+/', r'/<REDACTED>/'),
        (r'C:\\Users\\[^\\]+\\', r'C:\\<REDACTED>\\'),
        # IP addresses
        (r'\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b', r'***IP_ADDRESS_REDACTED***'),
    ]
    
    result = data
    for pattern, replacement in patterns:
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
    
    return result


def _redact_request_data(request_data: dict[str, Any]) -> dict[str, Any]:
    """Redact sensitive fields from request data."""
    if not request_data:
        return {}
    
    # Make a copy to avoid modifying original
    redacted_data = {}
    for key, value in request_data.items():
        if isinstance(value, str):
            redacted_data[key] = _redact_sensitive_data(value)
        elif isinstance(value, dict):
            redacted_data[key] = _redact_request_data(value)
        elif isinstance(value, list):
            redacted_data[key] = [
                _redact_request_data(item) if isinstance(item, dict) else 
                ("***REDACTED***" if isinstance(item, str) and 
                 any(token in item.lower() for token in ['password', 'secret', 'token', 'key']) 
                 else item)
                for item in value
            ]
        else:
            redacted_data[key] = value
    
    return redacted_data


def _redact_stack_trace(trace: str) -> str:
    """Remove potential secrets from stack traces before storage."""
    if not trace:
        return trace
    return _redact_sensitive_data(trace)


logger = logging.getLogger(__name__)


class ErrorLogService:
    """Service for logging and tracking application errors."""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.error_logs

    async def log_error(
        self,
        error: Exception,
        error_type: str,
        endpoint: str,
        method: str,
        user: str | None = None,
        role: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        request_data: dict[str, Any] | None = None,
        response_status: int | None = None,
        context: dict[str, Any] | None = None,
        severity: str = "error",
        include_stack_trace: bool = True,
    ) -> str:
        """
        Log an error to the database with sensitive information redacted.

        Args:
            error: The exception that occurred
            error_type: Type/classification of the error
            endpoint: API endpoint where error occurred
            method: HTTP method
            user: Username if authenticated
            role: User role if authenticated
            ip_address: Client IP address
            user_agent: Client user agent
            request_data: Request payload (will be redacted)
            response_status: HTTP response status
            context: Additional context information
            severity: Error severity level
            include_stack_trace: Whether to include stack trace (also redacted)

        Returns:
            ID of the created log entry
        """
        try:
            # Get stack trace if requested
            stack_trace = None
            if include_stack_trace:
                try:
                    stack_trace = "".join(
                        traceback.format_exception(type(error), error, error.__traceback__)
                    )
                    # Redact sensitive patterns before storage
                    stack_trace = _redact_stack_trace(stack_trace)
                except Exception:
                    stack_trace = _redact_stack_trace(traceback.format_exc())

            # Redact sensitive information from error message
            error_message = _redact_sensitive_data(str(error))
            
            # Redact request data
            redacted_request_data = _redact_request_data(request_data) if request_data else {}

            # Create log entry
            log_entry = {
                "timestamp": datetime.now(timezone.utc).replace(tzinfo=None),
                "error_type": error_type,
                "error_message": error_message,
                "error_code": getattr(error, 'error_code', 'GENERIC_ERROR') if hasattr(error, 'error_code') else 'GENERIC_ERROR',
                "severity": severity,
                "endpoint": endpoint,
                "method": method,
                "user": user,
                "role": role,
                "ip_address": _redact_sensitive_data(ip_address) if ip_address else None,
                "user_agent": user_agent,
                "stack_trace": stack_trace,
                "request_data": redacted_request_data,
                "response_status": response_status,
                "context": context or {},
                "resolved": False,
            }

            result = await self.collection.insert_one(log_entry)
            log_entry["id"] = str(result.inserted_id)

            # Log to application logger based on severity
            log_level = {
                "critical": logging.CRITICAL,
                "error": logging.ERROR,
                "warning": logging.WARNING,
                "info": logging.INFO,
            }.get(severity, logging.ERROR)

            logger.log(
                log_level,
                f"Error logged: {error_type} - {error_message}",
                extra={
                    "error_id": str(result.inserted_id),
                    "endpoint": endpoint,
                    "user": user,
                },
            )

            return str(result.inserted_id)
        except Exception as e:
            logger.error(f"Failed to log error: {_redact_sensitive_data(str(e))}", exc_info=True)
            # Don't raise - error logging failures shouldn't break the app
            return ""

    async def log_http_error(
        self,
        status_code: int,
        endpoint: str,
        method: str,
        user: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        request_data: dict[str, Any] | None = None,
        response_body: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> str:
        """
        Log HTTP errors (4xx, 5xx) with sensitive information redacted.
        """
        try:
            redacted_request_data = _redact_request_data(request_data) if request_data else {}
            redacted_response_body = _redact_sensitive_data(response_body) if response_body else None

            log_entry = {
                "timestamp": datetime.now(timezone.utc).replace(tzinfo=None),
                "error_type": "HTTP_ERROR",
                "error_message": f"HTTP {status_code} error",
                "error_code": f"HTTP_{status_code}",
                "severity": "warning" if status_code < 500 else "error",
                "endpoint": endpoint,
                "method": method,
                "status_code": status_code,
                "user": user,
                "ip_address": _redact_sensitive_data(ip_address) if ip_address else None,
                "user_agent": user_agent,
                "request_data": redacted_request_data,
                "response_body": redacted_response_body,
                "context": context or {},
                "resolved": False,
            }

            result = await self.collection.insert_one(log_entry)
            log_entry["id"] = str(result.inserted_id)

            logger.warning(
                f"HTTP {status_code} error logged for endpoint {endpoint}",
                extra={
                    "error_id": str(result.inserted_id),
                    "endpoint": endpoint,
                    "user": user,
                },
            )

            return str(result.inserted_id)
        except Exception as e:
            logger.error(f"Failed to log HTTP error: {_redact_sensitive_data(str(e))}", exc_info=True)
            return ""

    async def get_recent_errors(
        self,
        limit: int = 50,
        severity: str | None = None,
        days_back: int = 7,
        unresolved_only: bool = True,
    ) -> list:
        """
        Retrieve recent errors with optional filtering.
        """
        query = {}
        
        if severity:
            query["severity"] = severity
            
        if unresolved_only:
            query["resolved"] = False
            
        if days_back:
            cutoff_date = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days_back)
            query["timestamp"] = {"$gte": cutoff_date}

        cursor = self.collection.find(query).sort("timestamp", -1).limit(limit)
        errors = await cursor.to_list(length=limit)
        
        # Convert ObjectId to string for each error
        for error in errors:
            error["id"] = str(error.pop("_id", ""))
            
        return errors

    async def mark_resolved(self, error_id: str) -> bool:
        """
        Mark an error as resolved.
        """
        try:
            result = await self.collection.update_one(
                {"_id": error_id if isinstance(error_id, type(self.collection.database.client)) else error_id},
                {"$set": {"resolved": True, "resolved_at": datetime.now(timezone.utc).replace(tzinfo=None)}}
            )
            return result.modified_count > 0
        except Exception:
            logger.error(f"Failed to mark error {error_id} as resolved", exc_info=True)
            return False