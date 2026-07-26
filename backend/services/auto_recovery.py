"""
Auto-recovery utilities for transient failure handling.

This module provides retry/fallback/default strategies for operations
that may fail transiently (e.g. network, database blips).
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Callable
from enum import Enum
from typing import Any, TypeVar

T = TypeVar("T")


class RecoveryStrategy(Enum):
    """Strategy to use when a recovery operation fails."""

    RETRY = "retry"
    FALLBACK = "fallback"
    DEFAULT = "default"


class AutoRecovery:
    """
    Generic auto-recovery wrapper with configurable retry/fallback/default strategies.

    Backoff sleeps are patched to no-ops in tests so retries run instantly.
    """

    def __init__(self) -> None:
        self.recovery_stats: dict[str, Any] = {
            "successful_recoveries": 0,
            "failed_recoveries": 0,
            "fallback_used": 0,
            "total_recoveries": 0,
        }
        self.error_history: list[str] = []
        self.max_history: int = 100

    def recover(
        self,
        fn: Callable[[], T],
        *,
        max_retries: int = 3,
        retry_delay: float = 1.0,
        strategy: RecoveryStrategy = RecoveryStrategy.RETRY,
        fallback: Callable[[], T] | None = None,
        default_value: T | None = None,
    ) -> tuple[T | None, bool, str | None]:
        """
        Synchronous recovery wrapper.

        Returns (result, ok, error).
        """
        last_error: str | None = None
        for attempt in range(max_retries + 1):
            try:
                result = fn()
                if attempt > 0:
                    self.recovery_stats["successful_recoveries"] += 1
                self.recovery_stats["total_recoveries"] += 1
                return (result, True, None)
            except Exception as e:
                last_error = (
                    f"All recovery attempts failed: {e}" if attempt == max_retries else str(e)
                )
                if attempt < max_retries:
                    time.sleep(retry_delay)

        # All retries exhausted
        self.recovery_stats["failed_recoveries"] += 1
        self.recovery_stats["total_recoveries"] += 1

        if strategy == RecoveryStrategy.FALLBACK and fallback is not None:
            try:
                result = fallback()
                self.recovery_stats["fallback_used"] += 1
                self._add_error(last_error)
                return (result, True, None)
            except Exception as e:
                last_error = str(e)

        if strategy == RecoveryStrategy.DEFAULT:
            self._add_error(last_error)
            return (default_value, True, last_error)

        self._add_error(last_error)
        return (None, False, last_error)

    async def recover_async(
        self,
        fn: Callable[[], Any],
        *,
        max_retries: int = 3,
        retry_delay: float = 1.0,
        strategy: RecoveryStrategy = RecoveryStrategy.RETRY,
        fallback: Callable[[], Any] | None = None,
        default_value: T | None = None,
    ) -> tuple[T | None, bool, str | None]:
        """
        Async recovery wrapper.
        """
        last_error: str | None = None
        for attempt in range(max_retries + 1):
            try:
                result = fn()
                if asyncio.iscoroutine(result):
                    result = await result
                if attempt > 0:
                    self.recovery_stats["successful_recoveries"] += 1
                self.recovery_stats["total_recoveries"] += 1
                return (result, True, None)
            except Exception as e:
                last_error = (
                    f"All recovery attempts failed: {e}" if attempt == max_retries else str(e)
                )
                if attempt < max_retries:
                    await asyncio.sleep(retry_delay)

        self.recovery_stats["failed_recoveries"] += 1
        self.recovery_stats["total_recoveries"] += 1

        if strategy == RecoveryStrategy.FALLBACK and fallback is not None:
            try:
                result = fallback()
                if asyncio.iscoroutine(result):
                    result = await result
                self.recovery_stats["fallback_used"] += 1
                self._add_error(last_error)
                return (result, True, None)
            except Exception as e:
                last_error = str(e)

        if strategy == RecoveryStrategy.DEFAULT:
            self._add_error(last_error)
            return (default_value, True, last_error)

        self._add_error(last_error)
        return (None, False, last_error)

    def get_stats(self) -> dict[str, Any]:
        """Return a snapshot of recovery statistics."""
        total = self.recovery_stats["total_recoveries"]
        success = self.recovery_stats["successful_recoveries"]
        rate = (success / total * 100) if total > 0 else 0.0
        return {
            **self.recovery_stats,
            "success_rate": round(rate, 1),
            "recent_errors": list(reversed(self.error_history))[:10],
        }

    def clear_history(self) -> None:
        """Clear error history and reset stats."""
        self.error_history = []
        self.recovery_stats = {
            "successful_recoveries": 0,
            "failed_recoveries": 0,
            "fallback_used": 0,
            "total_recoveries": 0,
        }

    def _add_error(self, error: str | None) -> None:
        if error:
            self.error_history.append(error)
            if len(self.error_history) > self.max_history:
                self.error_history = self.error_history[-self.max_history :]
