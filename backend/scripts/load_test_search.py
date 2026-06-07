"""Locust load test for the optimized item-search path.

Run (headless example):
    locust -f backend/locustfile.py --headless -u 30 -r 5 -t 45s \
        --host http://localhost:8001

Credentials default to the auto-seeded test users (AUTO_SEED_DEFAULT_USERS)
and can be overridden via LOADTEST_USERNAME / LOADTEST_PASSWORD.
"""
import os
import random

from locust import HttpUser, between, task

# Seeded default users (see backend/db/initialization.py). Override via env.
_DEFAULT_USERS = [
    ("admin", "admin123"),
    ("supervisor", "super123"),
    ("staff1", "staff123"),
]

_ENV_USER = os.getenv("LOADTEST_USERNAME")
_ENV_PASS = os.getenv("LOADTEST_PASSWORD")
USERS = [(_ENV_USER, _ENV_PASS)] if _ENV_USER and _ENV_PASS else _DEFAULT_USERS

QUERIES = ["item", "test", "ITEM001", "a", "5", "1", "stock", "b"]


class SearchUser(HttpUser):
    wait_time = between(0.5, 2)
    token = None

    def on_start(self):
        """Login to get a JWT token."""
        username, password = random.choice(USERS)
        response = self.client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
            name="POST /api/auth/login",
        )
        if response.status_code == 200:
            payload = response.json()
            # Login returns {"success": true, "data": {"access_token": ...}}.
            self.token = payload.get("data", {}).get("access_token") or payload.get(
                "access_token"
            )
            if not self.token:
                print("Login succeeded but no access token found:", payload)
        else:
            print("Failed to login:", response.status_code, response.text[:200])

    @task(3)
    def search_items(self):
        """Optimized search. NOTE: q/limit/offset are QUERY PARAMS, not a body."""
        if not self.token:
            return
        query = random.choice(QUERIES)
        self.client.post(
            f"/api/items/search/optimized?q={query}&limit=20&offset=0",
            headers={"Authorization": f"Bearer {self.token}"},
            name="POST /api/items/search/optimized",
        )

    @task(1)
    def search_exact_barcode(self):
        """Exact-ish barcode lookup against the same endpoint."""
        if not self.token:
            return
        barcode = f"51{random.randint(1000, 9999)}"
        self.client.post(
            f"/api/items/search/optimized?q={barcode}&limit=1&offset=0",
            headers={"Authorization": f"Bearer {self.token}"},
            name="POST /api/items/search/optimized (barcode)",
        )
