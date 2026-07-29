"""
Shim for backward compatibility.
See backend/services/resilience/auto_recovery.py
"""
from backend.services.resilience.auto_recovery import AutoRecovery, RecoveryStrategy, with_auto_recovery

__all__ = ["AutoRecovery", "RecoveryStrategy", "with_auto_recovery"]
