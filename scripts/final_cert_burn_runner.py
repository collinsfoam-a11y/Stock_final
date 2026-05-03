#!/usr/bin/env python3
"""Run a deterministic projection/sync burn test and emit a certification report."""

from __future__ import annotations

import argparse
import json
import random
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pymongo import MongoClient

from backend.config import settings
from backend.utils.auth_utils import create_access_token


@dataclass
class HttpResult:
    status: int
    latency_ms: float
    body_text: str
    body_json: Optional[dict[str, Any]]
    error: Optional[str] = None


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-Request-ID": str(uuid.uuid4()),
    }


def http_request(
    *,
    method: str,
    url: str,
    token: str,
    payload: Optional[dict[str, Any]] = None,
    timeout: float = 20.0,
) -> HttpResult:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = Request(url, data=data, headers=_headers(token), method=method)
    started = time.perf_counter()
    try:
        with urlopen(req, timeout=timeout) as response:
            body_bytes = response.read()
            text = body_bytes.decode("utf-8", errors="replace")
            parsed = None
            if text:
                try:
                    parsed = json.loads(text)
                except json.JSONDecodeError:
                    parsed = None
            return HttpResult(
                status=int(response.status),
                latency_ms=(time.perf_counter() - started) * 1000.0,
                body_text=text,
                body_json=parsed,
            )
    except HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        parsed = None
        if text:
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                parsed = None
        return HttpResult(
            status=int(exc.code),
            latency_ms=(time.perf_counter() - started) * 1000.0,
            body_text=text,
            body_json=parsed,
            error=str(exc),
        )
    except URLError as exc:
        return HttpResult(
            status=0,
            latency_ms=(time.perf_counter() - started) * 1000.0,
            body_text="",
            body_json=None,
            error=str(exc.reason),
        )


def load_session_inventory(session_id: str) -> list[dict[str, Any]]:
    client = MongoClient(settings.MONGO_URL)
    try:
        db = client[settings.DB_NAME]
        snapshot = db.session_snapshots.find_one(
            {"session_id": session_id},
            {"_id": 0, "items": 1},
        )
        items = snapshot.get("items", []) if isinstance(snapshot, dict) else []
        normalized: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            item_code = str(item.get("item_code") or "").strip()
            source = item.get("source_data") if isinstance(item.get("source_data"), dict) else {}
            barcode = str(
                item.get("barcode")
                or source.get("barcode")
                or item_code
            ).strip()
            if not item_code or not barcode:
                continue
            stock_qty_raw = item.get("stock_qty")
            try:
                stock_qty = float(stock_qty_raw)
            except (TypeError, ValueError):
                stock_qty = 0.0
            normalized.append(
                {
                    "item_code": item_code,
                    "barcode": barcode,
                    "stock_qty": stock_qty,
                }
            )
        return normalized
    finally:
        client.close()


def derive_qty(stock_qty: float) -> float:
    # Keep low-variance writes to avoid approval/circuit-breaker noise in certification load.
    if stock_qty <= 0:
        return 0.0
    return min(stock_qty, 5.0)


def extract_runtime_metrics(metrics_json: dict[str, Any]) -> dict[str, Any]:
    runtime = metrics_json.get("runtime") if isinstance(metrics_json, dict) else {}
    gauges = runtime.get("gauges") if isinstance(runtime, dict) else {}
    counters = runtime.get("counters") if isinstance(runtime, dict) else {}
    return {
        "projection_drift_count": int(
            counters.get("projection_drift_count", gauges.get("projection_drift_count", 0)) or 0
        ),
        "projection_gap_count": int(
            counters.get("projection_gap_count", gauges.get("projection_gap_count", 0)) or 0
        ),
        "projection_freshness_lag": float(gauges.get("projection_freshness_lag", 0.0) or 0.0),
        "sync_queue_size": float(gauges.get("sync_queue_size", 0.0) or 0.0),
        "sync_failure_rate": float(
            counters.get("sync_failure_rate", gauges.get("sync_failure_rate", 0.0)) or 0.0
        ),
        "projection_readiness_status": float(gauges.get("projection_readiness_status", 0.0) or 0.0),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8001")
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--username", default="staff1")
    parser.add_argument("--location-id", default="Main")
    parser.add_argument("--floor-id", default="F1")
    parser.add_argument("--rack-prefix", default="R-BURN")
    parser.add_argument("--renew-token-per-request", action="store_true")
    parser.add_argument("--disable-create", action="store_true")
    parser.add_argument("--seed-record-id", default="")
    parser.add_argument("--seed-client-record-id", default="")
    parser.add_argument("--seed-item-code", default="")
    parser.add_argument("--seed-barcode", default="")
    parser.add_argument("--seed-rack-id", default="R-BURN-SEED")
    parser.add_argument("--duration-seconds", type=int, default=3600)
    parser.add_argument("--read-interval-seconds", type=float, default=1.0)
    parser.add_argument("--create-interval-seconds", type=float, default=10.0)
    parser.add_argument("--replay-interval-seconds", type=float, default=6.0)
    parser.add_argument("--metrics-interval-seconds", type=float, default=10.0)
    parser.add_argument("--freshness-ttl-seconds", type=int, default=300)
    parser.add_argument(
        "--allowed-item-codes",
        default="",
        help="Optional comma-separated item_code allow-list for create operations.",
    )
    parser.add_argument(
        "--max-create-ops",
        type=int,
        default=0,
        help="Maximum successful create operations (0 means no explicit cap).",
    )
    parser.add_argument(
        "--output",
        default=".agent/reports/final-burn-test-60m.json",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    static_token = create_access_token({"sub": args.username})

    def runtime_token() -> str:
        if args.renew_token_per_request:
            return create_access_token({"sub": args.username})
        return static_token
    inventory = load_session_inventory(args.session_id)
    allowed_codes = {
        code.strip()
        for code in str(args.allowed_item_codes or "").split(",")
        if code.strip()
    }
    if allowed_codes:
        inventory = [item for item in inventory if item["item_code"] in allowed_codes]
    if not inventory:
        report = {
            "passed": False,
            "error": "No snapshot inventory items found for session.",
            "session_id": args.session_id,
            "timestamp": utc_now_iso(),
        }
        output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report, indent=2))
        return 1

    base_url = args.base_url.rstrip("/")
    started_at = time.monotonic()
    end_at = started_at + max(args.duration_seconds, 1)

    next_read = started_at
    next_create = started_at
    next_replay = started_at
    next_metrics = started_at

    created_records: list[dict[str, Any]] = []
    if args.seed_record_id and args.seed_item_code and args.seed_barcode:
        seed_client_record_id = (
            str(args.seed_client_record_id).strip() or str(args.seed_record_id).strip()
        )
        created_records.append(
            {
                "record_id": str(args.seed_record_id).strip(),
                "client_record_id": seed_client_record_id,
                "session_id": args.session_id,
                "item_code": str(args.seed_item_code).strip(),
                "barcode": str(args.seed_barcode).strip(),
                "location_id": args.location_id,
                "floor_id": args.floor_id,
                "rack_id": args.seed_rack_id,
                "verified_qty": 0.0,
                "damaged_qty": 0,
                "created_at": utc_now_iso(),
                "updated_at": utc_now_iso(),
            }
        )
    used_item_codes: set[str] = set()
    metrics_series: list[dict[str, Any]] = []
    sync_samples: list[dict[str, Any]] = []
    read_samples: list[dict[str, Any]] = []

    sync_create_ok = 0
    sync_create_fail = 0
    sync_replay_ok = 0
    sync_replay_fail = 0
    read_ok = 0
    read_fail = 0
    read_503 = 0

    create_ops_attempted = 0

    while time.monotonic() < end_at:
        now = time.monotonic()

        if now >= next_create and not args.disable_create:
            create_cap_reached = args.max_create_ops > 0 and sync_create_ok >= args.max_create_ops
            item = None
            if not create_cap_reached:
                item = next(
                    (row for row in inventory if row["item_code"] not in used_item_codes),
                    None,
                )
            if item is not None:
                create_ops_attempted += 1
                record_id = f"burn-{uuid.uuid4()}"
                qty = derive_qty(float(item.get("stock_qty", 0.0) or 0.0))
                record = {
                    "record_id": record_id,
                    "client_record_id": record_id,
                    "session_id": args.session_id,
                    "item_code": item["item_code"],
                    "barcode": item["barcode"],
                    "location_id": args.location_id,
                    "floor_id": args.floor_id,
                    "rack_id": f"{args.rack_prefix}-{len(created_records) + 1}",
                    "verified_qty": qty,
                    "damaged_qty": 0,
                    "created_at": utc_now_iso(),
                    "updated_at": utc_now_iso(),
                }
                payload = {
                    "batch_id": f"burn-create-{uuid.uuid4().hex[:12]}",
                    "records": [record],
                }
                result = http_request(
                    method="POST",
                    url=f"{base_url}/api/sync/batch",
                    token=runtime_token(),
                    payload=payload,
                )
                sync_samples.append(
                    {
                        "ts": utc_now_iso(),
                        "phase": "create",
                        "status": result.status,
                        "latency_ms": result.latency_ms,
                        "record_id": record_id,
                        "item_code": item["item_code"],
                        "error": result.error,
                        "body_snippet": result.body_text[:240],
                    }
                )
                if result.status == 200:
                    used_item_codes.add(item["item_code"])
                    created_records.append(record)
                    sync_create_ok += 1
                else:
                    sync_create_fail += 1
            next_create += max(args.create_interval_seconds, 0.1)

        if now >= next_replay and created_records:
            replay_record = random.choice(created_records)
            replay_payload = {
                "batch_id": f"burn-replay-{uuid.uuid4().hex[:12]}",
                "records": [
                    {
                        **replay_record,
                        "created_at": utc_now_iso(),
                        "updated_at": utc_now_iso(),
                    }
                ],
            }
            result = http_request(
                method="POST",
                url=f"{base_url}/api/sync/batch",
                token=runtime_token(),
                payload=replay_payload,
            )
            sync_samples.append(
                {
                    "ts": utc_now_iso(),
                    "phase": "replay",
                    "status": result.status,
                    "latency_ms": result.latency_ms,
                    "record_id": replay_record["record_id"],
                    "item_code": replay_record["item_code"],
                    "error": result.error,
                    "body_snippet": result.body_text[:240],
                }
            )
            if result.status == 200:
                sync_replay_ok += 1
            else:
                sync_replay_fail += 1
            next_replay += max(args.replay_interval_seconds, 0.1)

        if now >= next_read:
            for endpoint in ("/api/dashboard/stats", "/api/dashboard/filters/options"):
                result = http_request(
                    method="GET",
                    url=f"{base_url}{endpoint}",
                    token=runtime_token(),
                    payload=None,
                )
                read_samples.append(
                    {
                        "ts": utc_now_iso(),
                        "endpoint": endpoint,
                        "status": result.status,
                        "latency_ms": result.latency_ms,
                    }
                )
                if result.status == 200:
                    read_ok += 1
                else:
                    read_fail += 1
                    if result.status == 503:
                        read_503 += 1
            next_read += max(args.read_interval_seconds, 0.1)

        if now >= next_metrics:
            metrics_result = http_request(
                method="GET",
                url=f"{base_url}/api/metrics/json",
                token=runtime_token(),
                payload=None,
            )
            snapshot = {
                "ts": utc_now_iso(),
                "http_status": metrics_result.status,
            }
            if metrics_result.status == 200 and isinstance(metrics_result.body_json, dict):
                snapshot.update(extract_runtime_metrics(metrics_result.body_json))
            metrics_series.append(snapshot)
            next_metrics += max(args.metrics_interval_seconds, 0.1)

        time.sleep(0.05)

    drift_breaches = [
        row for row in metrics_series if int(row.get("projection_drift_count", 0) or 0) > 0
    ]
    gap_breaches = [
        row for row in metrics_series if int(row.get("projection_gap_count", 0) or 0) > 0
    ]
    freshness_breaches = [
        row
        for row in metrics_series
        if float(row.get("projection_freshness_lag", 0.0) or 0.0) > args.freshness_ttl_seconds
    ]
    queue_positive = [row for row in metrics_series if float(row.get("sync_queue_size", 0.0) or 0.0) > 0]
    sync_failure_rate_breaches = [
        row
        for row in metrics_series
        if float(row.get("sync_failure_rate", 0.0) or 0.0) > 0.02
    ]

    anomalies: list[dict[str, Any]] = []
    if drift_breaches:
        anomalies.append({"type": "projection_drift", "count": len(drift_breaches)})
    if gap_breaches:
        anomalies.append({"type": "projection_gap", "count": len(gap_breaches)})
    if freshness_breaches:
        anomalies.append({"type": "stale_readiness", "count": len(freshness_breaches)})
    if queue_positive:
        anomalies.append({"type": "queue_not_drained", "count": len(queue_positive)})
    if sync_failure_rate_breaches:
        anomalies.append({"type": "sync_failure_rate", "count": len(sync_failure_rate_breaches)})
    if read_503 > 0:
        anomalies.append({"type": "projection_inconsistent_503", "count": read_503})
    if sync_create_fail + sync_replay_fail > 0:
        anomalies.append({"type": "sync_non_200", "count": sync_create_fail + sync_replay_fail})
    if read_fail > 0:
        anomalies.append({"type": "read_non_200", "count": read_fail})

    passed = len(anomalies) == 0

    report = {
        "timestamp": utc_now_iso(),
        "duration_seconds": args.duration_seconds,
        "session_id": args.session_id,
        "username": args.username,
        "inventory_items_available": len(inventory),
        "inventory_items_used": len(used_item_codes),
        "sync": {
            "create_ok": sync_create_ok,
            "create_fail": sync_create_fail,
            "create_attempted": create_ops_attempted,
            "replay_ok": sync_replay_ok,
            "replay_fail": sync_replay_fail,
            "total_requests": sync_create_ok + sync_create_fail + sync_replay_ok + sync_replay_fail,
            "success_rate": (
                (sync_create_ok + sync_replay_ok)
                / max(sync_create_ok + sync_create_fail + sync_replay_ok + sync_replay_fail, 1)
            ),
        },
        "reads": {
            "ok": read_ok,
            "fail": read_fail,
            "gate_503": read_503,
            "total_requests": read_ok + read_fail,
            "success_rate": read_ok / max(read_ok + read_fail, 1),
        },
        "metrics": {
            "samples": len(metrics_series),
            "max_projection_freshness_lag": max(
                (float(row.get("projection_freshness_lag", 0.0) or 0.0) for row in metrics_series),
                default=0.0,
            ),
            "max_sync_queue_size": max(
                (float(row.get("sync_queue_size", 0.0) or 0.0) for row in metrics_series),
                default=0.0,
            ),
            "max_sync_failure_rate": max(
                (float(row.get("sync_failure_rate", 0.0) or 0.0) for row in metrics_series),
                default=0.0,
            ),
            "max_projection_drift_count": max(
                (int(row.get("projection_drift_count", 0) or 0) for row in metrics_series),
                default=0,
            ),
            "max_projection_gap_count": max(
                (int(row.get("projection_gap_count", 0) or 0) for row in metrics_series),
                default=0,
            ),
        },
        "anomalies": anomalies,
        "passed": passed,
        "time_series_metrics": metrics_series,
        "samples": {
            "sync": sync_samples[-120:],
            "reads": read_samples[-120:],
        },
    }

    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Burn report written: {output_path}")
    print(json.dumps({"passed": passed, "anomalies": anomalies}, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
