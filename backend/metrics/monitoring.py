import time

from prometheus_client import Counter, Histogram

# Track SQL injection attempts
sql_injection_counter = Counter(
    'sql_injection_attempts_total',
    'Total SQL injection attempts blocked',
    ['endpoint']
)

# Track optimistic locking conflicts
optimistic_lock_counter = Counter(
    'optimistic_lock_conflicts_total',
    'Total optimistic locking conflicts',
    ['endpoint']
)

# Track database connection failures
connection_failures = Counter(
    'db_connection_failures_total',
    'Total database connection failures',
    ['error_type']
)

# Track API response times
api_response_time = Histogram(
    'api_response_time_seconds',
    'API response time in seconds',
    ['method', 'endpoint'],
    buckets=[0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0]
)


def track_sql_injection(endpoint: str):
    sql_injection_counter.labels(endpoint=endpoint).inc()


def track_optimistic_lock(endpoint: str):
    optimistic_lock_counter.labels(endpoint=endpoint).inc()


def track_connection_failure(error_type: str):
    connection_failures.labels(error_type=error_type).inc()


class ResponseTimeMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        
        start_time = time.time()
        response = await self.app(scope, receive, send)
        duration = time.time() - start_time
        
        # Extract method and path
        method = scope['method']
        path = scope['path']
        
        api_response_time.labels(
            method=method,
            endpoint=path
        ).observe(duration)
        
        return response