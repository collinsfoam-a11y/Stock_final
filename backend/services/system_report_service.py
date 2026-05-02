import io
import logging
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Optional

import pandas as pd
import psutil

logger = logging.getLogger(__name__)


class SystemReportService:
    def __init__(self, db):
        self.db = db

    async def generate_report(self, report_id, start_date=None, end_date=None, format="json"):
        if report_id == "system_health":
            data = await self._get_system_health_data(start_date, end_date)
        elif report_id == "user_activity":
            data = await self._get_user_activity_data(start_date, end_date)
        elif report_id == "sync_history":
            data = await self._get_sync_history_data(start_date, end_date)
        elif report_id == "error_logs":
            data = await self._get_error_logs_data(start_date, end_date)
        elif report_id == "audit_trail":
            data = await self._get_audit_trail_data(start_date, end_date)
        else:
            raise ValueError(f"Unknown report ID: {report_id}")

        if format == "json":
            return data
        if format == "csv":
            return self._to_csv(data)
        if format == "excel":
            return self._to_excel(data)
        raise ValueError(f"Unsupported format: {format}")

    async def _get_system_health_data(self, start_date, end_date):
        start_dt, end_dt = self._normalize_date_range(start_date, end_date)

        system_metrics = await self._fetch_collection_documents("system_metrics", limit=500)
        metric_rows = [
            self._serialize_row(row)
            for row in system_metrics
            if self._is_in_range(
                self._extract_timestamp(row, "timestamp", "recorded_at"), start_dt, end_dt
            )
        ]
        if metric_rows:
            metric_rows.sort(key=lambda row: row.get("timestamp", ""), reverse=True)
            return metric_rows

        api_metrics = await self._fetch_collection_documents("api_metrics", limit=5000)
        aggregated_rows = self._aggregate_api_metrics(api_metrics, start_dt, end_dt)
        if aggregated_rows:
            return aggregated_rows

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if not self._is_in_range(now, start_dt, end_dt):
            return []

        return [await self._build_live_system_snapshot(now, start_dt, end_dt)]

    async def _get_user_activity_data(self, start_date, end_date):
        start_dt, end_dt = self._normalize_date_range(start_date, end_date)
        activities: list[dict[str, Any]] = []

        for log in await self._fetch_collection_documents("activity_logs", limit=300):
            timestamp = self._extract_timestamp(log, "timestamp")
            if not self._is_in_range(timestamp, start_dt, end_dt):
                continue
            activities.append(
                self._serialize_row(
                    {
                        "timestamp": timestamp,
                        "username": log.get("user"),
                        "action": log.get("action"),
                        "status": self._normalize_scalar(log.get("status", "success")),
                        "ip_address": log.get("ip_address"),
                        "source": "activity_log",
                    }
                )
            )

        for log in await self._fetch_collection_documents("login_history", limit=300):
            timestamp = self._extract_timestamp(log, "timestamp", "created_at")
            if not self._is_in_range(timestamp, start_dt, end_dt):
                continue
            activities.append(
                self._serialize_row(
                    {
                        "timestamp": timestamp,
                        "username": log.get("username"),
                        "action": log.get("action", "login"),
                        "status": self._normalize_scalar(log.get("status", "success")),
                        "ip_address": log.get("ip_address"),
                        "source": "login_history",
                    }
                )
            )

        for log in await self._fetch_collection_documents("audit_logs", limit=300):
            timestamp = self._extract_timestamp(log, "timestamp")
            if not self._is_in_range(timestamp, start_dt, end_dt):
                continue
            activities.append(
                self._serialize_row(
                    {
                        "timestamp": timestamp,
                        "username": log.get("actor_username") or log.get("user"),
                        "action": self._normalize_scalar(
                            log.get("event_type") or log.get("action")
                        ),
                        "status": self._normalize_scalar(log.get("status", "success")),
                        "ip_address": log.get("ip_address"),
                        "source": "audit_log",
                    }
                )
            )

        activities.sort(key=lambda row: row.get("timestamp", ""), reverse=True)
        return activities[:100]

    async def _get_sync_history_data(self, start_date, end_date):
        start_dt, end_dt = self._normalize_date_range(start_date, end_date)
        history: list[dict[str, Any]] = []

        for log in await self._fetch_collection_documents("sync_history", limit=300):
            timestamp = self._extract_timestamp(log, "timestamp", "last_sync", "last_synced")
            if not self._is_in_range(timestamp, start_dt, end_dt):
                continue
            history.append(
                self._serialize_row(
                    {
                        "timestamp": timestamp,
                        "sync_type": log.get("type") or log.get("sync_type"),
                        "status": self._normalize_scalar(log.get("status")),
                        "items_processed": log.get("items_processed", 0),
                        "duration_ms": log.get("duration_ms") or log.get("batch_duration_ms"),
                        "source": "sync_history",
                    }
                )
            )

        for log in await self._fetch_collection_documents("sync_metadata", limit=50):
            timestamp = self._extract_timestamp(log, "last_sync", "timestamp")
            if not self._is_in_range(timestamp, start_dt, end_dt):
                continue
            history.append(
                self._serialize_row(
                    {
                        "timestamp": timestamp,
                        "sync_type": log.get("_id") or log.get("type") or "sync_metadata",
                        "status": self._normalize_scalar(
                            log.get("last_sync_status") or log.get("status") or "unknown"
                        ),
                        "items_processed": log.get("items_processed")
                        or log.get("updated_count")
                        or log.get("items_checked")
                        or 0,
                        "duration_ms": log.get("duration_ms") or log.get("last_sync_duration"),
                        "source": "sync_metadata",
                    }
                )
            )

        for log in await self._fetch_collection_documents("erp_sync_metadata", limit=50):
            timestamp = self._extract_timestamp(log, "last_sync", "last_synced", "timestamp")
            if not self._is_in_range(timestamp, start_dt, end_dt):
                continue
            history.append(
                self._serialize_row(
                    {
                        "timestamp": timestamp,
                        "sync_type": log.get("_id") or log.get("type") or "erp_sync_metadata",
                        "status": self._normalize_scalar(log.get("status", "completed")),
                        "items_processed": log.get("items_processed")
                        or log.get("updated_count")
                        or 0,
                        "duration_ms": log.get("duration_ms") or log.get("last_sync_duration"),
                        "source": "erp_sync_metadata",
                    }
                )
            )

        history.sort(key=lambda row: row.get("timestamp", ""), reverse=True)
        return history[:100]

    async def _get_error_logs_data(self, start_date, end_date):
        start_dt, end_dt = self._normalize_date_range(start_date, end_date)
        rows: list[dict[str, Any]] = []

        for log in await self._fetch_collection_documents("error_logs", limit=500):
            timestamp = self._extract_timestamp(log, "timestamp")
            if not self._is_in_range(timestamp, start_dt, end_dt):
                continue
            rows.append(
                self._serialize_row(
                    {
                        "timestamp": timestamp,
                        "severity": self._normalize_scalar(
                            log.get("severity") or log.get("level") or "error"
                        ),
                        "error_type": log.get("error_type") or log.get("type") or "UnknownError",
                        "error_message": log.get("error_message") or log.get("message") or "",
                        "endpoint": log.get("endpoint"),
                        "user": log.get("user") or log.get("user_id"),
                        "resolved": bool(log.get("resolved", False)),
                    }
                )
            )

        rows.sort(key=lambda row: row.get("timestamp", ""), reverse=True)
        return rows[:100]

    async def _get_audit_trail_data(self, start_date, end_date):
        start_dt, end_dt = self._normalize_date_range(start_date, end_date)
        rows: list[dict[str, Any]] = []

        for log in await self._fetch_collection_documents("audit_logs", limit=500):
            timestamp = self._extract_timestamp(log, "timestamp")
            if not self._is_in_range(timestamp, start_dt, end_dt):
                continue
            rows.append(
                self._serialize_row(
                    {
                        "timestamp": timestamp,
                        "action": self._normalize_scalar(
                            log.get("event_type") or log.get("action")
                        ),
                        "user": log.get("actor_username") or log.get("user") or "System",
                        "status": self._normalize_scalar(log.get("status") or "success"),
                        "resource_id": log.get("resource_id"),
                        "details": log.get("details", {}),
                    }
                )
            )

        rows.sort(key=lambda row: row.get("timestamp", ""), reverse=True)
        return rows[:100]

    async def _build_live_system_snapshot(
        self, now: datetime, start_dt: Optional[datetime], end_dt: Optional[datetime]
    ) -> dict[str, Any]:
        error_window_start = start_dt or (now - timedelta(hours=24))
        error_window_end = end_dt or now
        error_count = await self._count_rows_in_range(
            "error_logs", "timestamp", error_window_start, error_window_end
        )

        mongodb_status = "connected"
        try:
            await self.db.command("ping")
        except Exception:
            mongodb_status = "disconnected"

        return self._serialize_row(
            {
                "timestamp": now,
                "data_source": "live_snapshot",
                "cpu_usage": round(psutil.cpu_percent(interval=None), 2),
                "memory_usage": round(psutil.virtual_memory().percent, 2),
                "disk_usage": round(psutil.disk_usage("/").percent, 2),
                "mongodb_status": mongodb_status,
                "error_count": error_count,
            }
        )

    async def _fetch_collection_documents(
        self, collection_name: str, limit: int = 100
    ) -> list[dict[str, Any]]:
        try:
            collection = self.db[collection_name]
            return await collection.find({}).limit(limit).to_list(length=limit)
        except Exception as exc:
            logger.warning(
                "Failed to fetch report source collection",
                extra={"collection": collection_name, "error": str(exc)},
            )
            return []

    async def _count_rows_in_range(
        self,
        collection_name: str,
        timestamp_field: str,
        start_dt: Optional[datetime],
        end_dt: Optional[datetime],
    ) -> int:
        count = 0
        for row in await self._fetch_collection_documents(collection_name, limit=5000):
            timestamp = self._extract_timestamp(row, timestamp_field)
            if self._is_in_range(timestamp, start_dt, end_dt):
                count += 1
        return count

    def _aggregate_api_metrics(
        self,
        metrics: list[dict[str, Any]],
        start_dt: Optional[datetime],
        end_dt: Optional[datetime],
    ) -> list[dict[str, Any]]:
        buckets: dict[datetime, dict[str, Any]] = defaultdict(
            lambda: {"request_count": 0, "error_count": 0, "latency_total": 0.0, "latency_count": 0}
        )

        for row in metrics:
            timestamp = self._extract_timestamp(row, "timestamp", "created_at")
            if not self._is_in_range(timestamp, start_dt, end_dt):
                continue
            if timestamp is None:
                continue

            bucket = timestamp.replace(minute=0, second=0, microsecond=0)
            bucket_data = buckets[bucket]
            bucket_data["request_count"] += 1

            status_code = row.get("status_code") or row.get("response_status") or 0
            try:
                if int(status_code) >= 400:
                    bucket_data["error_count"] += 1
            except (TypeError, ValueError):
                pass

            latency_ms = row.get("latency_ms")
            if isinstance(latency_ms, (int, float)):
                bucket_data["latency_total"] += float(latency_ms)
                bucket_data["latency_count"] += 1

        results: list[dict[str, Any]] = []
        for bucket in sorted(buckets.keys(), reverse=True):
            bucket_data = buckets[bucket]
            request_count = bucket_data["request_count"]
            error_count = bucket_data["error_count"]
            latency_count = bucket_data["latency_count"]
            avg_latency = (
                round(bucket_data["latency_total"] / latency_count, 2) if latency_count else None
            )
            error_rate = round((error_count / request_count) * 100, 2) if request_count else 0.0
            results.append(
                self._serialize_row(
                    {
                        "timestamp": bucket,
                        "data_source": "api_metrics",
                        "request_count": request_count,
                        "error_count": error_count,
                        "error_rate_percent": error_rate,
                        "avg_latency_ms": avg_latency,
                    }
                )
            )

        return results

    def _normalize_date_range(
        self, start_date: Any, end_date: Any
    ) -> tuple[Optional[datetime], Optional[datetime]]:
        return self._parse_datetime(start_date), self._parse_datetime(end_date, end_of_day=True)

    def _parse_datetime(self, value: Any, end_of_day: bool = False) -> Optional[datetime]:
        if value is None:
            return None
        if isinstance(value, datetime):
            if value.tzinfo is not None:
                return value.astimezone(timezone.utc).replace(tzinfo=None)
            return value
        if isinstance(value, date):
            return datetime.combine(value, time.max if end_of_day else time.min)
        if not isinstance(value, str):
            return None

        normalized = value.strip()
        if not normalized:
            return None

        if normalized.endswith("Z"):
            normalized = normalized[:-1] + "+00:00"

        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return None

        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        elif end_of_day and "T" not in value and len(value) <= 10:
            parsed = datetime.combine(parsed.date(), time.max)
        return parsed

    def _extract_timestamp(self, row: dict[str, Any], *field_names: str) -> Optional[datetime]:
        for field_name in field_names:
            if field_name not in row:
                continue
            parsed = self._parse_datetime(row.get(field_name))
            if parsed is not None:
                return parsed
        return None

    def _is_in_range(
        self,
        timestamp: Optional[datetime],
        start_dt: Optional[datetime],
        end_dt: Optional[datetime],
    ) -> bool:
        if timestamp is None:
            return False
        if start_dt and timestamp < start_dt:
            return False
        if end_dt and timestamp > end_dt:
            return False
        return True

    def _normalize_scalar(self, value: Any) -> Any:
        if hasattr(value, "value"):
            return value.value
        return value

    def _serialize_row(self, row: dict[str, Any]) -> dict[str, Any]:
        serialized: dict[str, Any] = {}
        for key, value in row.items():
            normalized = self._normalize_scalar(value)
            if isinstance(normalized, datetime):
                serialized[key] = normalized.isoformat()
            else:
                serialized[key] = normalized
        return serialized

    def _to_csv(self, data):
        if not data:
            df = pd.DataFrame([{"message": "No data"}])
            return df.to_csv(index=False)
        df = pd.DataFrame(data)
        return df.to_csv(index=False)

    def _to_excel(self, data):
        if not data:
            data = [{"message": "No data"}]
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
            df = pd.DataFrame(data)
            df.to_excel(writer, index=False)
        return output.getvalue()
