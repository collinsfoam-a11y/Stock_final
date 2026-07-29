"""
Shim for backward compatibility.
See backend/services/diagnostics/auto_error_finder.py
"""
from backend.services.diagnostics.auto_error_finder import AutoErrorFinder, CodeIssue, BrokenFunction

__all__ = ["AutoErrorFinder", "CodeIssue", "BrokenFunction"]
