FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies for pyodbc (SQL Server)
RUN apt-get update && apt-get install -y --no-install-recommends \
    unixodbc \
    unixodbc-dev \
    curl \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast, reproducible installs
RUN pip install --no-cache-dir uv

# Use lockfile if present, otherwise fall back to requirements.production.txt
COPY requirements.production.txt requirements.lock* /app/
RUN if [ -f /app/requirements.lock ]; then \
        uv pip install --system --no-cache -r /app/requirements.lock; \
    else \
        uv pip install --system --no-cache -r /app/requirements.production.txt; \
    fi

COPY . /app/backend

RUN addgroup --system --gid 10001 app && adduser --system --uid 10001 --ingroup app app \
    && mkdir -p /var/log/stock_verify \
    && chown -R app:app /app /var/log/stock_verify

USER app

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health/ready', timeout=3)" || exit 1

CMD ["sh", "-c", "gunicorn backend.server:app -k uvicorn.workers.UvicornWorker -w ${WORKERS:-4} -b 0.0.0.0:8001 --timeout ${GUNICORN_TIMEOUT:-120} --graceful-timeout ${GUNICORN_GRACEFUL_TIMEOUT:-30} --access-logfile - --error-logfile -"]
