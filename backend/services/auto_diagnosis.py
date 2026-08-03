"""
Shim for backward compatibility.
See backend/services/diagnostics/auto_diagnosis.py
"""

from backend.services.diagnostics.auto_diagnosis import (
    AutoDiagnosisService,
    DiagnosisResult,
    ErrorCategory,
    ErrorSeverity,
)

__all__ = ["AutoDiagnosisService", "DiagnosisResult", "ErrorCategory", "ErrorSeverity"]
