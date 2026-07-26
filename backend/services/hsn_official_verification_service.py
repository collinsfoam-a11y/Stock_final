"""Optional official HSN verification via the E-Way Bill API (BSR Step 10).

This is the ONLY path in this codebase that can mark an HSN
`OFFICIAL_API_VERIFIED` -- everything from `HsnSuggestionService` is
`SUGGESTED_NOT_VERIFIED` at best. Fully optional and config-gated: with no
`EWAY_BILL_API_*` configuration present (the default in this environment,
since no real credentials exist here), verification calls never attempt a
network request and simply report `MANUAL_VERIFICATION_REQUIRED` --
consistent with the product direction that Stock Verify is not
tax-authoritative and official/manual verification remains a required,
separate step.

Never logs or returns credentials. Never crashes the caller: a configured
but failing/unreachable API reports `API_UNAVAILABLE`, not an exception.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any


class HsnOfficialVerificationService:
    def __init__(
        self,
        *,
        base_url: str | None = None,
        client_id: str | None = None,
        client_secret: str | None = None,
        gstin: str | None = None,
        auth_token: str | None = None,
    ) -> None:
        self._base_url = (
            base_url if base_url is not None else os.environ.get("EWAY_BILL_API_BASE_URL")
        )
        self._client_id = (
            client_id if client_id is not None else os.environ.get("EWAY_BILL_API_CLIENT_ID")
        )
        self._client_secret = (
            client_secret
            if client_secret is not None
            else os.environ.get("EWAY_BILL_API_CLIENT_SECRET")
        )
        self._gstin = gstin if gstin is not None else os.environ.get("EWAY_BILL_API_GSTIN")
        self._auth_token = (
            auth_token if auth_token is not None else os.environ.get("EWAY_BILL_API_AUTH_TOKEN")
        )

    def is_configured(self) -> bool:
        return bool(self._base_url and self._auth_token)

    async def verify_hsn(self, hsn_sac: str) -> dict[str, Any]:
        """Never raises. Returns a result dict with `hsn_sac`,
        `verification_status`, `verified_at`, `details` -- `details` never
        contains configured credentials, only whatever the (hypothetical)
        API returns about the HSN code itself."""
        if not self.is_configured():
            return {
                "hsn_sac": hsn_sac,
                "verification_status": "MANUAL_VERIFICATION_REQUIRED",
                "verified_at": None,
                "details": None,
            }

        try:
            details = await self._get_hsn_details_by_hsn_code(hsn_sac)
        except Exception:
            return {
                "hsn_sac": hsn_sac,
                "verification_status": "API_UNAVAILABLE",
                "verified_at": None,
                "details": None,
            }

        return {
            "hsn_sac": hsn_sac,
            "verification_status": "OFFICIAL_API_VERIFIED",
            "verified_at": datetime.now(timezone.utc).isoformat(),
            "details": details,
        }

    async def _get_hsn_details_by_hsn_code(self, hsn_sac: str) -> dict[str, Any]:
        """Real implementation would call the E-Way Bill
        `GetHsnDetailsByHsnCode` operation using `self._base_url`/
        `self._auth_token`/`self._gstin`. Not implemented against a live
        endpoint in this codebase -- no real E-Way Bill credentials or
        network access were available to build and verify a real HTTP
        client against during this phase (see
        docs/BSR_REMEDIATION_STATUS.md Step 10). Only reachable when
        `is_configured()` is True; tests exercise this path via
        monkeypatching, never a real network call."""
        raise NotImplementedError(
            "E-Way Bill API client is not implemented in this environment -- "
            "no live credentials or endpoint access were available to build "
            "and verify against. Configure and implement before enabling "
            "GST_VALIDATION_PROVIDER=eway_bill_official."
        )
