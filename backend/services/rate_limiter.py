"""
Shim for backward compatibility.
See backend/services/rate_limiting/limiter.py
"""
from backend.services.rate_limiting.limiter import RateLimiter, ConcurrentRequestHandler

__all__ = ["RateLimiter", "ConcurrentRequestHandler"]
