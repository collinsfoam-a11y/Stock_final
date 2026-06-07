import ast

# We will read backend/services/projection_service.py
# find `async def _project_inventory_event`
# and replace its definition and add 4 new helper functions before it.

FILE_PATH = r"d:\n.STK\backend\services\projection_service.py"

with open(FILE_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

# Define the new code
new_code = """
    async def _update_items_snapshot(
        self, session_id: str, item_id: str, item_code: str, line: dict, event: dict,
        counted_delta: float, damaged_delta: float, serial_delta: int, db_session: Any
    ) -> None:
        snapshot_query = {"session_id": session_id, "item_code": item_code}
        snapshot_update = {
            "$set": {
                "session_id": session_id,
                "item_id": item_id,
                "item_code": item_code,
                "item_name": line.get("item_name"),
                "base_uom": line.get("base_uom") or line.get("uom_code") or line.get("uom_name"),
                "input_uom": line.get("input_uom") or line.get("uom_code") or line.get("uom_name"),
                "location_id": line.get("location_id"),
                "floor_id": line.get("floor_id") or line.get("floor_no"),
                "floor_no": line.get("floor_no") or line.get("floor_id"),
                "rack_id": line.get("rack_id") or line.get("rack_no"),
                "rack_no": line.get("rack_no") or line.get("rack_id"),
                "counted_by": line.get("counted_by") or line.get("created_by"),
                "updated_by": line.get("updated_by") or line.get("counted_by"),
                "counted_at": line.get("counted_at"),
                "last_event_id": event.get("_id") or event.get("id"),
                "last_event_type": event.get("event_type"),
                "last_event_at": event.get("timestamp") or _utc_now(),
                "updated_at": _utc_now(),
                "projection_version": PROJECTION_VERSION,
            },
            "$inc": {
                "counted_qty": counted_delta,
                "damaged_qty": damaged_delta,
                "serial_count": serial_delta,
            },
        }
        await self.db.items_snapshot.update_one(
            snapshot_query,
            snapshot_update,
            upsert=True,
            **self._kwargs(db_session),
        )

    async def _update_batch_records(
        self, session_id: str, item_id: str, item_code: str, line: dict, event: dict,
        batch_ids: list, before_batches: dict, after_batches: dict, db_session: Any
    ) -> None:
        for current_batch_id in batch_ids:
            before_batch = before_batches.get(current_batch_id) or {}
            after_batch = after_batches.get(current_batch_id) or {}
            batch_counted_delta = _as_float(after_batch.get("counted_qty")) - _as_float(
                before_batch.get("counted_qty")
            )
            batch_damaged_delta = _as_float(after_batch.get("damaged_qty")) - _as_float(
                before_batch.get("damaged_qty")
            )
            if batch_counted_delta == 0.0 and batch_damaged_delta == 0.0:
                continue

            batch_update = {
                "$set": {
                    "session_id": session_id,
                    "item_id": item_id,
                    "item_code": item_code,
                    "batch_id": current_batch_id,
                    "batch_no": after_batch.get("batch_no")
                    or before_batch.get("batch_no")
                    or current_batch_id,
                    "item_name": line.get("item_name"),
                    "counted_by": line.get("counted_by") or line.get("created_by"),
                    "counted_at": line.get("counted_at"),
                    "last_event_id": event.get("_id") or event.get("id"),
                    "last_event_type": event.get("event_type"),
                    "last_event_at": event.get("timestamp") or _utc_now(),
                    "updated_at": _utc_now(),
                    "projection_version": PROJECTION_VERSION,
                },
                "$inc": {
                    "counted_qty": batch_counted_delta,
                    "damaged_qty": batch_damaged_delta,
                },
            }
            await self.db.batch_records.update_one(
                {
                    "session_id": session_id,
                    "item_code": item_code,
                    "batch_id": current_batch_id,
                },
                batch_update,
                upsert=True,
                **self._kwargs(db_session),
            )

    async def _update_serial_records(
        self, session_id: str, item_id: str, item_code: str, line: dict, event: dict,
        batch_id: str, added_serials: list, removed_serials: list, db_session: Any
    ) -> None:
        for serial in added_serials:
            serial_query = self._serial_scope_query(
                item_id=item_id,
                item_code=item_code,
                serial_field="serial_no",
                serial_value=serial,
            )
            await self.db.serial_records.update_one(
                serial_query,
                {
                    "$set": {
                        "item_id": item_id,
                        "serial_no": serial,
                        "session_id": session_id,
                        "item_code": item_code,
                        "batch_id": batch_id,
                        "count_line_id": self._line_identifier(line),
                        "status": "DAMAGED" if _as_float(line.get("damaged_qty")) > 0 else "GOOD",
                        "last_event_at": event.get("timestamp") or _utc_now(),
                        "updated_at": _utc_now(),
                        "projection_version": PROJECTION_VERSION,
                    }
                },
                upsert=True,
                **self._kwargs(db_session),
            )
            await self.db.serial_registry.update_one(
                serial_query,
                {
                    "$set": {
                        "item_id": item_id,
                        "serial_no": serial,
                        "session_id": session_id,
                        "item_code": item_code,
                        "item_name": line.get("item_name"),
                        "counted_by": line.get("counted_by") or line.get("created_by"),
                        "floor_id": line.get("floor_id") or line.get("floor_no"),
                        "rack_id": line.get("rack_id") or line.get("rack_no"),
                        "batch_id": batch_id,
                        "count_line_id": self._line_identifier(line),
                        "status": "LOCKED",
                        "source_event_id": event.get("_id") or event.get("id"),
                        "updated_at": _utc_now(),
                        "projection_version": PROJECTION_VERSION,
                    }
                },
                upsert=True,
                **self._kwargs(db_session),
            )
            item_serial_query = self._serial_scope_query(
                item_id=item_id,
                item_code=item_code,
                serial_field="serial_number",
                serial_value=serial,
            )
            await self.db.item_serials.update_one(
                item_serial_query,
                {
                    "$set": {
                        "item_id": item_id,
                        "serial_number": serial,
                        "session_id": session_id,
                        "item_code": item_code,
                        "item_name": line.get("item_name"),
                        "count_line_id": self._line_identifier(line),
                        "rack_id": line.get("rack_id") or line.get("rack_no"),
                        "floor_no": line.get("floor_id") or line.get("floor_no"),
                        "batch_id": batch_id,
                        "status": "LOCKED",
                        "updated_at": _utc_now(),
                        "projection_version": PROJECTION_VERSION,
                    }
                },
                upsert=True,
                **self._kwargs(db_session),
            )

        for serial in removed_serials:
            serial_query = self._serial_scope_query(
                item_id=item_id,
                item_code=item_code,
                serial_field="serial_no",
                serial_value=serial,
            )
            await self.db.serial_records.delete_one(serial_query, **self._kwargs(db_session))
            await self.db.serial_registry.delete_one(serial_query, **self._kwargs(db_session))
            item_serial_query = self._serial_scope_query(
                item_id=item_id,
                item_code=item_code,
                serial_field="serial_number",
                serial_value=serial,
            )
            await self.db.item_serials.delete_one(item_serial_query, **self._kwargs(db_session))

    async def _update_erp_snapshot(
        self, session_id: str, item_id: str, item_code: str, line: dict, event: dict, db_session: Any
    ) -> None:
        await self.db.erp_snapshot.update_one(
            {"session_id": session_id, "item_code": item_code},
            {
                "$set": {
                    "session_id": session_id,
                    "item_id": item_id,
                    "item_code": item_code,
                    "baseline_qty": _as_float(line.get("erp_qty")),
                    "current_sql_qty": _as_float(line.get("current_sql_qty")),
                    "baseline_hash": line.get("baseline_hash"),
                    "updated_at": _utc_now(),
                    "last_event_id": event.get("_id") or event.get("id"),
                    "projection_version": PROJECTION_VERSION,
                }
            },
            upsert=True,
            **self._kwargs(db_session),
        )

    async def _project_inventory_event(
        self,
        event: dict[str, Any],
        payload: dict[str, Any],
        *,
        db_session: Optional[Any],
    ) -> None:
        after = payload.get("after") if isinstance(payload.get("after"), dict) else None
        before = payload.get("before") if isinstance(payload.get("before"), dict) else None
        line = after or payload.get("count_line") or before
        if not isinstance(line, dict):
            return

        session_id = _normalize_string(payload.get("session_id") or line.get("session_id"))
        item_id = _normalize_string(
            payload.get("item_id") or line.get("item_id") or line.get("item_code")
        )
        item_code = _normalize_string(line.get("item_code") or payload.get("item_id") or item_id)
        if not session_id or not item_id or not item_code:
            return

        batch_id = _normalize_string(payload.get("batch_id") or line.get("batch_id")) or "NO_BATCH"
        counted_delta = _as_float((payload.get("delta") or {}).get("counted_qty"))
        damaged_delta = _as_float((payload.get("delta") or {}).get("damaged_qty"))
        serial_delta = int((payload.get("delta") or {}).get("serial_count") or 0)
        if event.get("event_type") == "SCAN_ADDED" and counted_delta == 0.0:
            counted_delta = _as_float(line.get("counted_qty"))
            damaged_delta = _as_float(line.get("damaged_qty"))
            serial_delta = len(_normalize_serials(after or line))

        before_serials = set(_normalize_serials(before))
        after_serials = set(_normalize_serials(after))
        added_serials = sorted(after_serials)
        removed_serials = sorted(before_serials - after_serials)
        before_batches = _normalize_batches(before)
        after_batches = _normalize_batches(after)
        if event.get("event_type") == "SCAN_ADDED" and not after_batches:
            after_batches = _normalize_batches(after or line)
        batch_ids = sorted(set(before_batches.keys()) | set(after_batches.keys()))

        await self._update_items_snapshot(
            session_id, item_id, item_code, line, event, counted_delta, damaged_delta, serial_delta, db_session
        )

        await self._update_batch_records(
            session_id, item_id, item_code, line, event, batch_ids, before_batches, after_batches, db_session
        )

        await self._update_serial_records(
            session_id, item_id, item_code, line, event, batch_id, added_serials, removed_serials, db_session
        )

        await self._update_erp_snapshot(
            session_id, item_id, item_code, line, event, db_session
        )
        await self._project_verified_item_projection(event, payload, db_session=db_session)"""

# We find the start of `async def _project_inventory_event`
import re
pattern = r'(    async def _project_inventory_event\(\n.*?\n        await self\._project_verified_item_projection\(event, payload, db_session=db_session\)\n)'

match = re.search(pattern, content, flags=re.DOTALL)
if match:
    old_code = match.group(1)
    new_content = content.replace(old_code, new_code[1:]) # remove leading newline
    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Successfully refactored projection_service.py")
else:
    print("Could not find the function to replace")
