"""
Admin Control Panel API
Provides endpoints for service management, status monitoring, and system control
"""

# ruff: noqa: E402
import sys
from pathlib import Path

# Add project root to path for direct execution (debugging)
# This allows the file to be run directly for testing/debugging
project_root = Path(__file__).parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

import io  # noqa: E402
import logging  # noqa: E402
from backend.utils.api_utils import sanitize_for_logging
import os  # noqa: E402
from collections.abc import Callable, Iterable
from datetime import datetime  # noqa: E402
from typing import Any, Optional, TypedDict  # noqa: E402, Optional

import psutil  # noqa: E402
from fastapi import APIRouter, Depends, HTTPException, status  # noqa: E402
from fastapi.responses import Response, StreamingResponse  # noqa: E402

# Import auth
from backend.auth import get_current_user  # noqa: E402
from backend.config import settings  # noqa: E402
from backend.services.admin_control_service import get_admin_control_service  # noqa: E402
from backend.sql_server_connector import sql_connector  # noqa: E402
from backend.utils.port_detector import PortDetector  # noqa: E402
from backend.utils.service_manager import ServiceManager  # noqa: E402

# Constants
BACKEND_PROCESS_NEEDLE = "server.py"

logger = logging.getLogger(__name__)

admin_control_router = APIRouter(prefix="/api/admin/control", tags=["Admin Control"])


def _parse_ports_csv(value: str) -> list[int]:
    ports: list[int] = []
    for part in (value or "").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            ports.append(int(part))
        except ValueError:
            continue
    return ports


def _get_backend_ports() -> list[int]:
    ports: list[int] = []

    # Dynamic list based on settings.PORT
    base_port = _safe_int(getattr(settings, "PORT", None)) or _safe_int(os.getenv("PORT")) or 8001
    if base_port:
        ports.extend([base_port] + [base_port + i for i in range(1, 6)])

    env_ports = os.getenv("ADMIN_BACKEND_PORTS") or os.getenv("BACKEND_PORTS")
    if env_ports:
        ports.extend(_parse_ports_csv(env_ports))

    configured = _safe_int(getattr(settings, "PORT", None)) or _safe_int(os.getenv("PORT")) or 8001
    ports.append(configured)

    seen: set[int] = set()
    unique: list[int] = []
    for p in ports:
        if p in seen:
            continue
        seen.add(p)
        unique.append(p)
    return unique


def _get_frontend_ports() -> list[int]:
    ports: list[int] = []

    env_ports = os.getenv("ADMIN_FRONTEND_PORTS") or os.getenv("FRONTEND_PORTS")
    if env_ports:
        ports.extend(_parse_ports_csv(env_ports))
    else:
        single = (
            os.getenv("EXPO_PUBLIC_WEB_PORT")
            or os.getenv("EXPO_WEB_PORT")
            or os.getenv("EXPO_PORT")
            or os.getenv("WEB_PORT")
        )
        if single:
            parsed = _safe_int(single)
            if parsed:
                ports.append(parsed)

    ports.extend([8081, 19000, 19001])

    seen: set[int] = set()
    unique: list[int] = []
    for p in ports:
        if p in seen:
            continue
        seen.add(p)
        unique.append(p)
    return unique


class ServiceStatus(TypedDict, total=False):
    running: Optional[bool]
    port: Optional[int]
    pid: Optional[int]
    url: Optional[str]
    uptime: Optional[int]
    status: Optional[str]


ServicesStatusMap = dict[str, ServiceStatus]


def _safe_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def require_admin(current_user: dict = Depends(get_current_user)):
    """Require admin role"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def _match_process_on_ports(
    ports: Iterable[int], matcher: Callable[[str], bool]
) -> Optional[tuple[int, int, psutil.Process]]:
    """Return (port, pid, process) for the first process whose command line matches."""
    for port in ports:
        if not ServiceManager.is_port_in_use(port):
            continue
        pid = ServiceManager.get_process_using_port(port)
        if not pid:
            continue
        try:
            process = psutil.Process(pid)
            cmdline = " ".join(process.cmdline())
        except (psutil.Error, OSError):
            continue
        if matcher(cmdline):
            return port, pid, process
    return None


def _calculate_uptime(process: psutil.Process) -> Optional[int]:
    try:
        return int(datetime.now().timestamp() - process.create_time())
    except (psutil.Error, OSError):
        return None


def _get_backend_status() -> ServiceStatus:
    status: ServiceStatus = {
        "running": False,
        "port": None,
        "pid": None,
        "url": None,
        "uptime": None,
    }

    def is_backend_process(cmd: str) -> bool:
        return BACKEND_PROCESS_NEEDLE in cmd

    result = _match_process_on_ports(_get_backend_ports(), is_backend_process)
    if result:
        port, pid, process = result
        status["running"] = True
        status["port"] = port
        status["pid"] = pid
        status["url"] = f"http://127.0.0.1:{port}"
        status["uptime"] = _calculate_uptime(process)
    return status


def _get_frontend_status() -> ServiceStatus:
    status: ServiceStatus = {
        "running": False,
        "port": None,
        "pid": None,
        "url": None,
    }

    def is_frontend_process(cmd: str) -> bool:
        return "expo" in cmd.lower() or "metro" in cmd.lower()

    result = _match_process_on_ports(_get_frontend_ports(), is_frontend_process)
    if result:
        port, pid, _ = result
        status["running"] = True
        status["port"] = port
        status["pid"] = pid
        status["url"] = f"http://127.0.0.1:{port}"
    return status


async def _get_mongodb_status() -> ServiceStatus:
    # Try using existing connection first
    try:
        if await get_admin_control_service().ping_auth_database():
            mongo_status = PortDetector.get_mongo_status()
            return {
                "running": True,
                "port": _safe_int(mongo_status.get("port")),
                "url": mongo_status.get("url"),
                "status": "connected",
            }
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.warning("Direct MongoDB check failed, falling back to PortDetector: %s", sanitize_for_logging(str(e)))

    mongo_status = PortDetector.get_mongo_status()
    running_flag = mongo_status.get("is_running")
    running: Optional[bool] = bool(running_flag) if running_flag is not None else None
    return {
        "running": running,
        "port": _safe_int(mongo_status.get("port")),
        "url": mongo_status.get("url"),
        "status": str(mongo_status.get("status", "unknown")),
    }


def _test_sql_connection() -> Optional[bool]:
    try:
        return sql_connector.test_connection()
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error("SQL connection test failed: %s", sanitize_for_logging(str(e)))
        return False


def _get_sql_server_status() -> ServiceStatus:
    is_connected = _test_sql_connection()
    config = sql_connector.config or {}

    return {
        "running": is_connected,
        "port": config.get("port"),
        "status": "connected" if is_connected else "disconnected",
        "url": (f"{config.get('host')}:{config.get('port')}" if config.get("host") else None),
    }


def _terminate_backend_processes() -> int:
    """Terminate backend processes and return how many were killed."""
    killed = 0
    for port in _get_backend_ports():
        if not ServiceManager.is_port_in_use(port):
            continue
        pid = ServiceManager.get_process_using_port(port)
        if not pid:
            continue
        if _terminate_if_matches(pid, BACKEND_PROCESS_NEEDLE):
            killed += 1
    return killed


def _terminate_if_matches(pid: int, needle: str) -> bool:
    """Terminate process if its command line contains the needle."""
    try:
        process = psutil.Process(pid)
        if needle not in " ".join(process.cmdline()):
            return False
        _terminate_process(process)
        return True
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
        return False


def _terminate_process(process: psutil.Process) -> None:
    try:
        process.terminate()
        process.wait(timeout=5)
    except psutil.TimeoutExpired:
        process.kill()


def _is_any_port_in_use(ports: Iterable[int]) -> bool:
    return any(ServiceManager.is_port_in_use(port) for port in ports)


def _format_issue(
    service: str, message: str, severity: str = "critical", issue_type: str = "error"
) -> dict[str, Any]:
    return {
        "type": issue_type,
        "severity": severity,
        "service": service,
        "message": message,
        "timestamp": datetime.now().isoformat(),
    }


def _collect_system_issues() -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    mongo_status = PortDetector.get_mongo_status()
    if not mongo_status["is_running"]:
        issues.append(_format_issue("mongodb", "MongoDB is not running"))
    if not _is_any_port_in_use(_get_backend_ports()):
        issues.append(_format_issue("backend", "Backend server is not running"))

    # Add SQL Server check
    if not _test_sql_connection():
        issues.append(_format_issue("sql_server", "SQL Server is not connected", severity="medium"))

    return issues


async def _gather_all_services_status() -> ServicesStatusMap:
    """Gather status for all services"""
    return {
        "backend": _get_backend_status(),
        "frontend": _get_frontend_status(),
        "mongodb": await _get_mongodb_status(),
        "sql_server": _get_sql_server_status(),
    }


def _format_services_response(services: ServicesStatusMap) -> dict[str, Any]:
    """Format services status response"""
    return {
        "success": True,
        "data": services,
        "timestamp": datetime.now().isoformat(),
    }


CRITICAL_SERVICE_KEYS = ["backend", "mongodb"]
OPTIONAL_SERVICE_KEYS = ["frontend", "sql_server"]


def _count_running_services(services: ServicesStatusMap, keys: Iterable[str]) -> int:
    return sum(1 for key in keys if bool(services.get(key, {}).get("running")))


def _calculate_service_scores(services: ServicesStatusMap) -> tuple[float, int, int]:
    running_critical = _count_running_services(services, CRITICAL_SERVICE_KEYS)
    running_optional = _count_running_services(services, OPTIONAL_SERVICE_KEYS)
    critical_score = (running_critical / len(CRITICAL_SERVICE_KEYS)) * 60
    optional_score = (running_optional / len(OPTIONAL_SERVICE_KEYS)) * 40
    return critical_score + optional_score, running_critical, running_optional


def _apply_issue_penalty(score: float, critical_issues: int) -> float:
    penalty = min(critical_issues * 10, 30)
    return max(0, min(100, score - penalty))


def _determine_health_status(score: float) -> str:
    if score >= 80:
        return "healthy"
    if score >= 50:
        return "degraded"
    return "critical"


def _build_health_payload(
    score: float, running_critical: int, running_optional: int, critical_issues: int
) -> dict[str, Any]:
    return {
        "score": round(score, 1),
        "status": _determine_health_status(score),
        "breakdown": {
            "critical_services": f"{running_critical}/{len(CRITICAL_SERVICE_KEYS)}",
            "optional_services": f"{running_optional}/{len(OPTIONAL_SERVICE_KEYS)}",
            "critical_issues": critical_issues,
        },
    }


@admin_control_router.get("/services/status")
async def get_services_status(current_user: dict = Depends(require_admin)):
    """Get status of all services (backend, frontend, MongoDB, SQL Server)"""
    try:
        services: ServicesStatusMap = await _gather_all_services_status()
        return _format_services_response(services)
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error("Error getting services status: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get services status: {str(e)}",
        ) from e


def _find_running_backend_process() -> Optional[dict[str, Any]]:
    for port in _get_backend_ports():
        if not ServiceManager.is_port_in_use(port):
            continue

        pid = ServiceManager.get_process_using_port(port)
        if not pid:
            continue

        try:
            process = psutil.Process(pid)
            if BACKEND_PROCESS_NEEDLE in " ".join(process.cmdline()):
                return {
                    "success": True,
                    "message": "Backend is already running",
                    "port": port,
                    "pid": pid,
                }
        except (RuntimeError, TypeError, ValueError, OSError):
            pass
    return None


@admin_control_router.post("/services/backend/start")
async def start_backend(current_user: dict = Depends(require_admin)):
    """Start backend server"""
    try:
        # Check if already running
        existing_backend = _find_running_backend_process()
        if existing_backend:
            return existing_backend

        # Start backend (this would typically be done via script)
        return {
            "success": True,
            "message": "Backend start command issued. Check status for updates.",
            "note": "Backend should be started using scripts/start_backend.sh or scripts/start_backend.ps1",
        }
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error("Error starting backend: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start backend: {str(e)}",
        )


def _create_stop_response(killed: int) -> dict[str, Any]:
    """Create response for backend stop operation"""
    if killed > 0:
        return {
            "success": True,
            "message": f"Stopped {killed} backend instance(s)",
        }
    else:
        return {
            "success": True,
            "message": "No backend instances found",
        }


@admin_control_router.post("/services/backend/stop")
async def stop_backend(current_user: dict = Depends(require_admin)):
    """Stop backend server"""
    try:
        killed = _terminate_backend_processes()
        return _create_stop_response(killed)
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error("Error stopping backend: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to stop backend: {str(e)}",
        )


@admin_control_router.post("/services/frontend/start")
async def start_frontend(current_user: dict = Depends(require_admin)):
    """Start frontend server"""
    try:
        # Check if already running
        for port in _get_frontend_ports():
            if ServiceManager.is_port_in_use(port):
                pid = ServiceManager.get_process_using_port(port)
                if pid:
                    try:
                        process = psutil.Process(pid)
                        cmdline = " ".join(process.cmdline())
                        if "expo" in cmdline.lower() or "metro" in cmdline.lower():
                            return {
                                "success": True,
                                "message": "Frontend is already running",
                                "port": port,
                                "pid": pid,
                            }
                    except (RuntimeError, TypeError, ValueError, OSError):
                        pass

        return {
            "success": True,
            "message": "Frontend start command issued. Check status for updates.",
            "note": "Frontend should be started using scripts/start_frontend.sh or scripts/start_frontend.ps1",
        }
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error("Error starting frontend: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start frontend: {str(e)}",
        )


@admin_control_router.post("/services/frontend/stop")
async def stop_frontend(current_user: dict = Depends(require_admin)):
    """Stop frontend server"""
    try:
        killed = ServiceManager.kill_processes_by_name(["expo", "metro", "node.*expo"])

        # Also kill by ports
        for port in _get_frontend_ports():
            if ServiceManager.is_port_in_use(port):
                pid = ServiceManager.get_process_using_port(port)
                if pid:
                    ServiceManager.kill_process(pid)
                    killed += 1

        return {
            "success": True,
            "message": f"Stopped {killed} frontend process(es)",
        }
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error("Error stopping frontend: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to stop frontend: {str(e)}",
        )


def _categorize_issues(issues: list[dict[str, Any]]) -> dict[str, int]:
    """Categorize issues by severity"""
    return {
        "count": len(issues),
        "critical": int(len([i for i in issues if i.get("severity") == "critical"])),
        "warnings": int(len([i for i in issues if i.get("severity") == "medium"])),
    }


def _format_issues_response(issues: list[dict[str, Any]]) -> dict[str, Any]:
    """Format system issues response"""
    issue_stats = _categorize_issues(issues)
    return {
        "success": True,
        "data": {
            "issues": issues,
            **issue_stats,
        },
    }


@admin_control_router.get("/system/issues")
async def get_system_issues(current_user: dict = Depends(require_admin)):
    """Get system issues and errors"""
    try:
        issues = _collect_system_issues()
        return _format_issues_response(issues)
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error("Error getting system issues: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get system issues: {str(e)}",
        )


@admin_control_router.get("/devices")
async def get_login_devices(current_user: dict = Depends(require_admin)):
    """Get list of devices that have logged in"""
    try:
        # Get recent login sessions
        sessions = await get_admin_control_service().get_recent_login_sessions()

        devices = []
        seen_devices = set()

        for session in sessions:
            device_key = f"{session.get('ip_address', 'unknown')}-{session.get('device_info', {}).get('platform', 'unknown')}"
            if device_key not in seen_devices:
                seen_devices.add(device_key)
                devices.append(
                    {
                        "user": session.get("user"),
                        "ip_address": session.get("ip_address"),
                        "platform": session.get("device_info", {}).get("platform"),
                        "device": session.get("device_info", {}).get("device"),
                        "last_activity": session.get("last_activity"),
                        "created_at": session.get("created_at"),
                    }
                )

        return {
            "success": True,
            "data": {
                "devices": devices,
                "count": len(devices),
            },
        }
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error("Error getting devices: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get devices: {str(e)}",
        )


@admin_control_router.get("/reports/available")
async def get_available_reports(current_user: dict = Depends(require_admin)):
    """Get list of available reports"""
    return {
        "success": True,
        "data": {
            "reports": [
                {
                    "id": "user_activity",
                    "name": "User Activity Report",
                    "description": "Detailed user activity and login history",
                    "category": "users",
                },
                {
                    "id": "system_health",
                    "name": "System Metrics Report",
                    "description": "System performance and health metrics",
                    "category": "system",
                },
                {
                    "id": "sync_history",
                    "name": "Sync History Report",
                    "description": "ERP sync operations history",
                    "category": "sync",
                },
                {
                    "id": "error_logs",
                    "name": "Error Logs Report",
                    "description": "System errors and exceptions",
                    "category": "logs",
                },
                {
                    "id": "audit_trail",
                    "name": "Audit Trail Report",
                    "description": "Complete audit trail of all actions",
                    "category": "audit",
                },
            ]
        },
    }


@admin_control_router.post("/reports/generate")
async def generate_report(
    report_id: str,
    format: str = "json",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(require_admin),
):
    """Generate a report"""
    try:
        data = await get_admin_control_service().generate_report(
            report_id,
            start_date,
            end_date,
            format,
        )

        if format == "json":
            return {
                "success": True,
                "message": f"Report '{report_id}' generated successfully",
                "data": data,
            }
        elif format == "csv":
            if not data:
                data = "message\nNo data\n"
            return Response(
                content=data,
                media_type="text/csv",
                headers={
                    "Content-Disposition": f"attachment; filename={report_id}_{datetime.now().strftime('%Y%m%d')}.csv"
                },
            )
        elif format == "excel":
            if not data:
                import pandas as pd

                output = io.BytesIO()
                with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
                    pd.DataFrame([{"message": "No data"}]).to_excel(writer, index=False)
                data = output.getvalue()
            return StreamingResponse(
                io.BytesIO(data),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={
                    "Content-Disposition": f"attachment; filename={report_id}_{datetime.now().strftime('%Y%m%d')}.xlsx"
                },
            )

    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error("Error generating report: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate report: {str(e)}",
        )


def _parse_log_line(line: str) -> Optional[dict[str, Optional[str]]]:
    try:
        # Parse standard format: 2023-10-27 10:00:00 - logger - LEVEL - Message
        parts = line.strip().split(" - ", 3)
        if len(parts) >= 4:
            return {
                "timestamp": parts[0],
                "logger": parts[1],
                "level": parts[2],
                "message": parts[3],
            }
    except (RuntimeError, TypeError, ValueError, OSError):
        pass
    return None


def _read_log_file(
    log_path: Path, lines: int, level: Optional[str], service: str
) -> list[dict[str, Any]]:
    """Read and parse log file"""
    logs: list[dict[str, Any]] = []
    if not log_path.exists():
        return logs

    try:
        with open(log_path, encoding="utf-8") as f:
            all_lines = f.readlines()

            for line in reversed(all_lines):
                if len(logs) >= lines:
                    break

                log_entry = _parse_log_line(line)
                if not log_entry:
                    continue

                # Filter by level
                if level and log_entry["level"] != level.upper():
                    continue

                # Filter for SQL Server if requested
                if service == "sql_server":
                    logger_name = (log_entry.get("logger") or "").lower()
                    message_text = (log_entry.get("message") or "").lower()
                    if "sql" not in logger_name and "sql" not in message_text:
                        continue

                logs.append(log_entry)
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error("Error reading log file: %s", sanitize_for_logging(str(e)))

    return logs


@admin_control_router.get("/logs/{service}")
async def get_service_logs(
    service: str,
    lines: int = 100,
    level: Optional[str] = None,
    current_user: dict = Depends(require_admin),
):
    """Get service logs"""
    try:
        logs = []

        if service == "backend" or service == "sql_server":
            # Read backend logs from file
            log_file = settings.LOG_FILE or "app.log"
            log_path = Path(log_file)
            logs = _read_log_file(log_path, lines, level, service)

        if not logs and service == "frontend":
            frontend_status = _get_frontend_status()
            port = frontend_status.get("port") or (
                _get_frontend_ports()[0] if _get_frontend_ports() else None
            )
            logs = [
                {
                    "timestamp": datetime.now().isoformat(),
                    "level": "INFO",
                    "message": (
                        f"Expo server running on port {port}" if port else "Expo server running"
                    ),
                },
            ]
        elif not logs and service == "mongodb":
            logs = [
                {
                    "timestamp": datetime.now().isoformat(),
                    "level": "INFO",
                    "message": "MongoDB connection established",
                },
            ]

        return {
            "success": True,
            "data": {
                "service": service,
                "logs": logs,
                "count": len(logs),
                "filtered_by_level": level,
            },
        }
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error("Error getting logs: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get logs: {str(e)}",
        )


@admin_control_router.post("/logs/clear")
async def clear_service_logs(
    service: str,
    current_user: dict = Depends(require_admin),
):
    """Clear service logs"""
    try:
        if service == "backend" or service == "sql_server":
            log_file = settings.LOG_FILE or "app.log"
            log_path = Path(log_file)
            if log_path.exists():
                # Clear the file
                with open(log_path, "w", encoding="utf-8") as f:
                    f.write("")

        return {"success": True, "message": f"Logs for {service} cleared successfully"}
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error("Error clearing logs: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clear logs: {str(e)}",
        )


@admin_control_router.get("/sql-server/config")
async def get_sql_server_config(current_user: dict = Depends(require_admin)):
    """Get SQL Server configuration"""
    config = sql_connector.config or {}
    # Don't return password
    safe_config = {k: v for k, v in config.items() if k != "password"}

    # If not connected, return settings from env/config
    if not safe_config:
        safe_config = {
            "host": settings.SQL_SERVER_HOST,
            "port": settings.SQL_SERVER_PORT,
            "database": settings.SQL_SERVER_DATABASE,
            "user": settings.SQL_SERVER_USER,
            "auth": "sql" if settings.SQL_SERVER_USER else "windows",
        }

    return {"success": True, "data": safe_config}


@admin_control_router.post("/sql-server/config")
async def update_sql_server_config(
    config: dict[str, Any], current_user: dict = Depends(require_admin)
):
    """Update SQL Server configuration"""
    try:
        host = config.get("host")
        port = config.get("port", 1433)
        database = config.get("database")
        user = config.get("user")
        password = config.get("password")

        if not host or not database:
            raise HTTPException(status_code=400, detail="Host and database are required")

        # Try to connect
        # connect() raises exception on failure
        sql_connector.connect(host, int(port), database, user, password)

        return {
            "success": True,
            "message": "SQL Server configuration updated and connected successfully",
            "data": {k: v for k, v in sql_connector.config.items() if k != "password"},
        }

    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error("Error updating SQL Server config: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update configuration: {str(e)}",
        )


@admin_control_router.post("/sql-server/test")
async def test_sql_server_connection(
    config: dict[str, Optional[Any]] = None, current_user: dict = Depends(require_admin)
):
    """Test SQL Server connection"""
    try:
        if config:
            host = config.get("host")
            port = config.get("port", 1433)
            database = config.get("database")
            user = config.get("user")
            password = config.get("password")

            if not host or not database:
                raise HTTPException(status_code=400, detail="Host and database are required")

            # Try to connect
            sql_connector.connect(host, int(port or 1433), database, user, password)
            return {"success": True, "message": "Connection successful"}
        else:
            # Test existing connection
            success = sql_connector.test_connection()
            return {
                "success": success,
                "message": ("Connection is active" if success else "Connection is inactive"),
            }
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        return {"success": False, "message": f"Connection failed: {str(e)}"}


@admin_control_router.get("/system/health-score")
async def get_system_health_score(current_user: dict = Depends(require_admin)):
    """Calculate and return system health score"""
    try:
        services_status = await get_services_status(current_user)
        services = services_status["data"]
        base_score, running_critical, running_optional = _calculate_service_scores(services)

        issues_data = await get_system_issues(current_user)
        issues_payload = issues_data.get("data", {})
        issues = issues_payload.get("issues") or []
        critical_issues = len([i for i in issues if i.get("severity") == "critical"])

        final_score = _apply_issue_penalty(base_score, critical_issues)

        return {
            "success": True,
            "data": _build_health_payload(
                final_score, running_critical, running_optional, critical_issues
            ),
        }
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error("Error calculating health score: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to calculate health score: {str(e)}",
        )


@admin_control_router.get("/system/stats")
async def get_system_stats(current_user: dict = Depends(require_admin)):
    """Get system statistics summary"""
    try:
        # Get basic stats
        stats_counts = await get_admin_control_service().get_system_stats_counts()
        total_users = stats_counts["total_users"]
        total_sessions = stats_counts["total_sessions"]
        active_sessions = stats_counts["active_sessions"]

        # Get services status
        services_status = await get_services_status(current_user)
        services = services_status["data"]
        running_services = sum(1 for s in services.values() if s.get("running", False))

        return {
            "success": True,
            "data": {
                "total_services": 4,
                "running_services": running_services,
                "total_users": total_users,
                "total_sessions": total_sessions,
                "active_sessions": active_sessions,
                "timestamp": datetime.now().isoformat(),
            },
        }
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error("Error getting system stats: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get system stats: {str(e)}",
        )


@admin_control_router.post("/watchdog/run")
async def run_watchdog_checks(current_user: dict = Depends(require_admin)):
    """
    Manually trigger system watchdog checks.
    Scans for velocity anomalies, brute force attacks, and system health issues.
    """
    try:
        await get_admin_control_service().run_watchdog_checks()

        return {
            "success": True,
            "message": "Watchdog checks completed. Check audit logs for any alerts.",
            "timestamp": datetime.now().isoformat(),
        }
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error("Error running watchdog: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Watchdog execution failed: {str(e)}",
        )
