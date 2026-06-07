import re

FILE_PATH = r"d:\n.STK\backend\api\recount_api.py"

with open(FILE_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

new_helper = """
async def _process_recount_result_tx(
    db,
    tx,
    lifecycle_service,
    recount_id,
    request,
    username,
    is_privileged,
    now_dt,
    update_data,
):
    recount = await lifecycle_service.get_recount_request(recount_id, db_session=tx)
    if not recount:
        raise HTTPException(status_code=404, detail="Recount request not found")

    existing_line = await db.count_lines.find_one(
        {"id": recount["count_line_id"]},
        session=tx,
    )
    if not existing_line:
        raise HTTPException(status_code=404, detail="Count line for recount not found")
    original_counter = str(
        recount.get("original_counter")
        or existing_line.get("counted_by")
        or existing_line.get("created_by")
        or ""
    ).strip()
    if (
        recount.get("blind_recount_required")
        and not is_privileged
        and original_counter
        and original_counter == username
    ):
        raise HTTPException(
            status_code=403,
            detail="Blind recount requires a different staff user than the original count",
        )

    session_id = str(existing_line.get("session_id") or recount.get("session_id") or "")
    session = await lifecycle_service.ensure_session_active(session_id, db_session=tx)

    location_id = str(
        existing_line.get("location_id")
        or session.get("location_id")
        or session.get("warehouse")
        or ""
    ).strip()
    floor_id = str(
        existing_line.get("floor_id")
        or existing_line.get("floor_no")
        or session.get("floor_id")
        or ""
    ).strip()
    rack_id = str(
        existing_line.get("rack_id")
        or existing_line.get("rack_no")
        or session.get("rack_no")
        or ""
    ).strip()
    if not location_id or not floor_id or not rack_id:
        raise HTTPException(
            status_code=400,
            detail="CRITICAL: Recount requires location_id, floor_id and rack_id context",
        )

    previous_line_id = str(existing_line.get("id") or existing_line.get("_id"))
    new_line = dict(existing_line)
    new_line.pop("_id", None)
    new_line["id"] = str(uuid.uuid4())
    new_line["counted_qty"] = request.result_qty
    new_line["status"] = "pending"
    new_line["approval_status"] = "PENDING"
    new_line["verified"] = False
    new_line["verified_by"] = None
    new_line["verified_at"] = None
    new_line["rejected_by"] = None
    new_line["rejected_at"] = None
    new_line["recount_requested_at"] = None
    new_line["recount_requested_by"] = None
    new_line["recount_completed_at"] = now_dt
    new_line["recount_completed_by"] = username
    new_line["updated_at"] = now_dt
    new_line["updated_by"] = username
    new_line["location_id"] = location_id
    new_line["floor_id"] = floor_id
    new_line["rack_id"] = rack_id
    new_line.setdefault("floor_no", floor_id)
    new_line.setdefault("rack_no", rack_id)
    new_line["version"] = int(existing_line.get("version", 1) or 1) + 1
    new_line["previous_version_id"] = previous_line_id
    new_line["recount_of_id"] = (
        existing_line.get("recount_of_id")
        or existing_line.get("id")
        or previous_line_id
    )
    new_line["recount_iteration"] = (
        int(existing_line.get("recount_iteration", 0) or 0) + 1
    )
    new_line["blind_recount_completed_by_distinct_user"] = original_counter != username
    new_line["dual_verification_required"] = True

    write_service = CountLineWriteService(db)
    tx_context = {
        "session": session,
        "username": username,
        "db_session": tx,
    }
    await write_service.process_write(
        {"operation": "insert_one", "document": new_line},
        context={**tx_context, "skip_session_totals_update": True},
    )
    await write_service.process_write(
        {
            "operation": "update_one",
            "filter": {"_id": existing_line["_id"]},
            "update": {
                "$set": {
                    "status": "SUPERSEDED",
                    "superseded_at": now_dt,
                    "superseded_by": username,
                    "superseded_by_version_id": new_line["id"],
                    "location_id": location_id,
                    "floor_id": floor_id,
                    "rack_id": rack_id,
                }
            },
        },
        context=tx_context,
    )

    await lifecycle_service.transition_recount_request(
        recount_id=recount_id,
        target_status=RecountStatus.COMPLETED.value,
        actor=username,
        fields=update_data,
        db_session=tx,
    )
"""

# I need to insert new_helper before complete_recount_request
# And rewrite complete_recount_request's 'else:' branch to call it

replacement_code = """
        else:
            update_data["result_qty"] = request.result_qty
            async with mongo_transaction(db.client) as tx:
                await _process_recount_result_tx(
                    db,
                    tx,
                    lifecycle_service,
                    recount_id,
                    request,
                    username,
                    is_privileged,
                    now_dt,
                    update_data,
                )

        notification_service = NotificationService(db)
"""

pattern = r'        else:\n            update_data\["result_qty"\] = request\.result_qty\n            async with mongo_transaction\(db\.client\) as tx:\n.*?        notification_service = NotificationService\(db\)\n'

match = re.search(pattern, content, flags=re.DOTALL)
if match:
    old_code = match.group(0)
    new_content = content.replace(old_code, replacement_code[1:]) # skip newline
    
    # insert new_helper before @router.post("/{recount_id}/complete")
    insert_idx = new_content.find('@router.post("/{recount_id}/complete")')
    if insert_idx != -1:
        new_content = new_content[:insert_idx] + new_helper + "\n\n" + new_content[insert_idx:]
        with open(FILE_PATH, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("Successfully refactored complete_recount_request")
    else:
        print("Could not find complete_recount_request router decorator")
else:
    print("Could not find complete_recount_request 'else:' branch")
