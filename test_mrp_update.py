import asyncio, httpx, uuid
async def test():
    async with httpx.AsyncClient(base_url="http://localhost:8001") as client:
        # login
        token = (await client.post("/api/auth/login", json={"username": "staff1", "password": "staff123"})).json()["data"]["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        uid = str(uuid.uuid4())[:8]
        # create session
        resp_sess = await client.post("/api/sessions/", headers=headers, json={"warehouse": f"Test MRP {uid}", "type": "STANDARD", "location_type": "rack", "location_name": f"MRP Rack {uid}"})
        sess_id = resp_sess.json().get("data", {}).get("id") or resp_sess.json().get("id")
        
        # create count line
        resp_cl = await client.post("/api/count-lines", headers=headers, json={
            "session_id": sess_id,
            "item_code": "ITEM001",
            "counted_qty": 100,
            "barcode": "510001",
            "rack_no": f"A-{uid}",
            "idempotency_key": str(uuid.uuid4()),
            "correction_reason": {"code": "FOUND", "description": "Found missing items"}
        })
        cl_id = resp_cl.json().get("data", {}).get("id") or resp_cl.json().get("id")
        
        # update mrp
        if cl_id:
            resp = await client.put(f"/api/count-lines/{cl_id}", headers=headers, json={"mrp_counted": 150.5})
            print("Update response:", resp.status_code, resp.json())
        else:
            print("Failed to create count line:", resp_cl.text)
        
asyncio.run(test())
