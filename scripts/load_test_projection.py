#!/usr/bin/env python3
"""Small stdlib load probe for projection reads and optional sync bursts."""

from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


@dataclass
class Result:
    status: int
    latency_ms: float
    error: str | None = None


def _headers(token: str | None) -> dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "X-Request-ID": str(uuid.uuid4()),
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _request(
    method: str,
    url: str,
    *,
    token: str | None,
    payload: dict[str, Any] | None = None,
) -> Result:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(url, data=data, headers=_headers(token), method=method)
    start = time.perf_counter()
    try:
        with urlopen(request, timeout=10) as response:
            response.read()
            status = int(response.status)
            error = None
    except HTTPError as exc:
        exc.read()
        status = int(exc.code)
        error = str(exc)
    except URLError as exc:
        status = 0
        error = str(exc.reason)
    latency_ms = (time.perf_counter() - start) * 1000
    return Result(status=status, latency_ms=latency_ms, error=error)


async def _run_many(
    *,
    method: str,
    url: str,
    token: str | None,
    payloads: list[dict[str, Any] | None],
    concurrency: int,
) -> list[Result]:
    semaphore = asyncio.Semaphore(concurrency)

    async def one(payload: dict[str, Any] | None) -> Result:
        async with semaphore:
            return await asyncio.to_thread(
                _request,
                method,
                url,
                token=token,
                payload=payload,
            )

    return await asyncio.gather(*(one(payload) for payload in payloads))


def _sync_payload(index: int) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    record_id = f"load-{uuid.uuid4()}"
    return {
        "batch_id": f"load-batch-{index}",
        "records": [
            {
                "record_id": record_id,
                "client_record_id": record_id,
                "session_id": "load-test-session",
                "location_id": "load-location",
                "floor_id": "load-floor",
                "rack_id": "load-rack",
                "item_code": "load-test-item",
                "verified_qty": 1,
                "damaged_qty": 0,
                "created_at": now,
                "updated_at": now,
            }
        ],
    }


def _summary(name: str, results: list[Result]) -> None:
    latencies = [result.latency_ms for result in results]
    error_count = sum(1 for result in results if result.status >= 400 or result.status == 0)
    gate_503 = sum(1 for result in results if result.status == 503)
    p95 = statistics.quantiles(latencies, n=20)[18] if len(latencies) >= 20 else max(latencies)
    print(
        json.dumps(
            {
                "scenario": name,
                "requests": len(results),
                "error_rate": error_count / max(len(results), 1),
                "gate_503": gate_503,
                "latency_ms": {
                    "min": min(latencies),
                    "avg": statistics.fmean(latencies),
                    "p95": p95,
                    "max": max(latencies),
                },
            },
            indent=2,
        )
    )


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--token")
    parser.add_argument("--read-endpoint", default="/dashboard/stats")
    parser.add_argument("--requests", type=int, default=100)
    parser.add_argument("--concurrency", type=int, default=100)
    parser.add_argument("--include-sync-writes", action="store_true")
    parser.add_argument("--sync-requests", type=int, default=25)
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    read_results = await _run_many(
        method="GET",
        url=f"{base_url}{args.read_endpoint}",
        token=args.token,
        payloads=[None] * args.requests,
        concurrency=args.concurrency,
    )
    _summary("projection_reads", read_results)

    if args.include_sync_writes:
        sync_results = await _run_many(
            method="POST",
            url=f"{base_url}/api/sync/batch",
            token=args.token,
            payloads=[_sync_payload(index) for index in range(args.sync_requests)],
            concurrency=min(args.concurrency, args.sync_requests),
        )
        _summary("sync_burst", sync_results)

    return 1 if any(result.status == 0 for result in read_results) else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
