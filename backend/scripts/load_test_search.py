"""Locust load test for the optimized item-search path.

Run (headless example):
    locust -f backend/locustfile.py --headless -u 30 -r 5 -t 45s \
        --host http://localhost:8001

Credentials default to the auto-seeded test users and can be overridden:
  * LOADTEST_USERS="user1:pass1,user2:pass2,..."  (preferred for concurrency)
  * LOADTEST_USERNAME / LOADTEST_PASSWORD          (single account)

Session control is single-active-session per location, so reusing a small
credential pool across many virtual users causes login/session contention and
skews results. Seed enough accounts (LOADTEST_USERS) to cover the target
concurrency; a warning is emitted at test start when credentials < virtual users.
"""
import logging
import os
import random
from urllib.parse import urlencode

from locust import HttpUser, between, events, task

log = logging.getLogger("load_test_search")

# Seeded default users (see backend/db/initialization.py). Override via env.
_DEFAULT_USERS = [
    ("admin", "admin123"),
    ("supervisor", "super123"),
    ("staff1", "staff123"),
]


def _parse_users() -> list[tuple[str, str]]:
    """Build the credential pool from env (preferred) or seeded defaults."""
    raw = os.getenv("LOADTEST_USERS")
    if raw:
        pairs: list[tuple[str, str]] = []
        for chunk in raw.split(","):
            user, sep, password = chunk.strip().partition(":")
            if sep and user.strip() and password.strip():
                pairs.append((user.strip(), password.strip()))
        if pairs:
            return pairs
    env_user = os.getenv("LOADTEST_USERNAME")
    env_pass = os.getenv("LOADTEST_PASSWORD")
    if env_user and env_pass:
        return [(env_user, env_pass)]
    return list(_DEFAULT_USERS)


USERS = _parse_users()
QUERIES = ["item", "test", "ITEM001", "a", "5", "1", "stock", "b"]


@events.test_start.add_listener
def _warn_on_credential_contention(environment, **_kwargs):
    """Reusing one account across many virtual users collides with
    single-active-session-per-location enforcement. Warn loudly when target
    concurrency exceeds the number of distinct credentials."""
    target = getattr(getattr(environment, "runner", None), "target_user_count", None)
    if target is None:
        target = getattr(getattr(environment, "parsed_options", None), "num_users", None)
    if isinstance(target, int) and target > len(USERS):
        log.warning(
            "Load test configured for %d virtual users but only %d credential(s) "
            "available; accounts will be reused, colliding with single-active-"
            "session-per-location enforcement and skewing results. Provide at "
            "least %d accounts via LOADTEST_USERS.",
            target,
            len(USERS),
            target,
        )


class SearchUser(HttpUser):
    wait_time = between(0.5, 2)
    token = None

    def on_start(self):
        self._login()

    def _login(self):
        """(Re)authenticate and refresh the cached JWT access token."""
        username, password = random.choice(USERS)  # nosec B311
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
                log.warning("Login succeeded but no access token found: %s", payload)
        else:
            self.token = None
            log.warning("Failed to login: %s %s", response.status_code, response.text[:200])

    def _auth_headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}"}

    def _search(self, query: str, *, limit: int, offset: int, name: str):
        """POST a search request, URL-encoding params. Access tokens expire
        (~15 min) so on a 401 we transparently re-authenticate and retry once."""
        if not self.token:
            self._login()
            if not self.token:
                return
        url = "/api/items/search/optimized?" + urlencode(
            {"q": query, "limit": limit, "offset": offset}
        )
        response = self.client.post(url, headers=self._auth_headers(), name=name)
        if response.status_code == 401:
            # Token likely expired mid-run; refresh and retry once.
            self._login()
            if self.token:
                self.client.post(url, headers=self._auth_headers(), name=name)

    @task(3)
    def search_items(self):
        """Optimized search. NOTE: q/limit/offset are QUERY PARAMS, not a body."""
        self._search(
            random.choice(QUERIES),  # nosec B311
            limit=20,
            offset=0,
            name="POST /api/items/search/optimized",
        )

    @task(1)
    def search_exact_barcode(self):
        """Exact-ish barcode lookup against the same endpoint."""
        barcode = f"51{random.randint(1000, 9999)}"  # nosec B311
        self._search(
            barcode,
            limit=1,
            offset=0,
            name="POST /api/items/search/optimized (barcode)",
        )
