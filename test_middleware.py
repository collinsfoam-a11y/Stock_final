import asyncio
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from backend.middleware.input_sanitization import InputSanitizationMiddleware

app = FastAPI()
app.add_middleware(InputSanitizationMiddleware)

@app.post("/test")
async def test_route(request: Request):
    body = await request.json()
    return JSONResponse({"status": "ok", "body": body})

client = TestClient(app)

response = client.post("/test", json={"username": "<script>alert(1)</script>"})
print("Malicious:", response.status_code, response.text)

response = client.post("/test", json={"username": "normal"})
print("Normal:", response.status_code, response.text)
