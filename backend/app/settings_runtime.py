"""
Shim for backward compatibility.
See backend.config.runtime
"""

from backend.config.runtime import *  # noqa: F403 - back-compat shim: re-exports the moved module's public API
