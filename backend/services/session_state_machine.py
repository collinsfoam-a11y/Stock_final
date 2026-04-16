"""
Session State Machine

Enforces allowed session status transitions with case-insensitive matching.
"""

from __future__ import annotations

from enum import Enum


class SessionState(str, Enum):
    OPEN = "OPEN"
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    RECONCILE = "RECONCILE"
    COMPLETED = "COMPLETED"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"


class SessionStateMachine:
    """
    Defines allowed transitions for session lifecycle.
    """

    TRANSITIONS: dict[SessionState, set[SessionState]] = {
        SessionState.OPEN: {
            SessionState.ACTIVE,
            SessionState.RECONCILE,
            SessionState.CANCELLED,
            SessionState.CLOSED,
        },
        SessionState.ACTIVE: {
            SessionState.PAUSED,
            SessionState.RECONCILE,
            SessionState.COMPLETED,
            SessionState.CLOSED,
            SessionState.CANCELLED,
        },
        SessionState.PAUSED: {
            SessionState.ACTIVE,
            SessionState.COMPLETED,
            SessionState.CLOSED,
            SessionState.CANCELLED,
        },
        SessionState.RECONCILE: {SessionState.CLOSED, SessionState.COMPLETED},
        SessionState.COMPLETED: {SessionState.CLOSED},
        SessionState.CLOSED: set(),
        SessionState.CANCELLED: set(),
    }

    @classmethod
    def _normalize(cls, value: str) -> SessionState | None:
        if not value:
            return None
        # Normalize common lowercase values and synonyms
        try:
            return SessionState(value.upper())
        except ValueError:
            return None

    @classmethod
    def can_transition(cls, current_status: str, next_status: str) -> bool:
        current = cls._normalize(current_status)
        target = cls._normalize(next_status)
        if current is None or target is None:
            return False
        return target in cls.TRANSITIONS.get(current, set())
