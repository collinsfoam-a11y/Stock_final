"""
Shim for backward compatibility.
See backend/services/scheduler/auto_sync_manager.py
"""
from backend.services.scheduler.auto_sync_manager import AutoSyncManager

__all__ = ["AutoSyncManager"]
