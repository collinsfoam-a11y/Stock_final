"""Local HSN/SAC directory (BSR Step 10).

A local, source-tracked reference table of HSN/SAC codes/descriptions/GST
rates, used only as a *suggestion* seed for `HsnSuggestionService` -- never
as an authoritative GST compliance source. See Part C/Part D of the
governing requirement and docs/BSR_REMEDIATION_STATUS.md Step 10 for the
full source-trust policy.

Every record is source-tracked (`source`, `source_url`/`source_file`,
`source_downloaded_at`, `is_official_source`). Records from different
sources for the same `hsn_sac` are never merged or silently overwritten --
re-importing the *same* source for an existing `hsn_sac` refreshes only that
source's own record.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Optional

VALID_DIRECTORY_SOURCES = (
    "GST_PORTAL_DIRECTORY",
    "OFFICIAL_CBIC_REFERENCE",
    "MCP_INDIA_STACK_SEED",
    "OPEN_SOURCE_SEED",
    "MANUAL_UPLOAD",
)

# Only these sources are ever treated as official by default -- everything
# else (including MCP_INDIA_STACK_SEED and OPEN_SOURCE_SEED) is explicitly
# non-official, per the governing requirement's hard-block eligibility table.
_OFFICIAL_SOURCES = frozenset({"GST_PORTAL_DIRECTORY", "OFFICIAL_CBIC_REFERENCE"})


class HsnDirectoryError(ValueError):
    """Request-level validation error (bad source, missing required field)."""


def _tokenize(*parts: Optional[str]) -> set[str]:
    text = " ".join(p for p in parts if p)
    return {tok for tok in re.findall(r"[a-z0-9]+", text.lower()) if len(tok) > 1}


class HsnDirectoryService:
    def __init__(self, db: Any) -> None:
        self.db = db

    async def import_record(
        self,
        *,
        hsn_sac: str,
        description: str,
        source: str,
        current_user: dict[str, Any],
        gst_percentage: Optional[float] = None,
        source_url: Optional[str] = None,
        source_file: Optional[str] = None,
        is_official_source: Optional[bool] = None,
        keywords: Optional[list[str]] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        hsn_sac = str(hsn_sac or "").strip()
        if not hsn_sac:
            raise HsnDirectoryError("hsn_sac is required")
        if source not in VALID_DIRECTORY_SOURCES:
            raise HsnDirectoryError(
                f"source must be one of {VALID_DIRECTORY_SOURCES}, got {source!r}"
            )

        official = is_official_source if is_official_source is not None else source in _OFFICIAL_SOURCES
        now = datetime.now(timezone.utc)
        derived_keywords = set(keywords or []) | _tokenize(description, *(keywords or []))

        doc = {
            "hsn_sac": hsn_sac,
            "description": description,
            "gst_percentage": gst_percentage,
            "source": source,
            "source_url": source_url,
            "source_file": source_file,
            "source_downloaded_at": now,
            "is_official_source": bool(official),
            "is_active": True,
            "keywords": sorted(derived_keywords),
            "metadata": metadata or {},
        }

        # Keyed by (hsn_sac, source): re-importing the SAME source refreshes
        # its own record; a different source's existing record for the same
        # hsn_sac is never touched -- both are kept, never merged/overwritten.
        existing = await self.db.hsn_directory.find_one({"hsn_sac": hsn_sac, "source": source})
        if existing:
            await self.db.hsn_directory.update_one(
                {"hsn_sac": hsn_sac, "source": source}, {"$set": doc}
            )
        else:
            doc["created_at"] = now
            await self.db.hsn_directory.insert_one(doc)

        await self._audit(current_user, doc)
        return {k: v for k, v in doc.items() if k != "_id"}

    async def search(
        self, query: str, *, source_filter: Optional[str] = None, active_only: bool = True, limit: int = 20
    ) -> list[dict[str, Any]]:
        mongo_query: dict[str, Any] = {}
        if active_only:
            mongo_query["is_active"] = True
        if source_filter:
            mongo_query["source"] = source_filter

        records = await self.db.hsn_directory.find(mongo_query).to_list(length=10000)
        if not query:
            return [self._strip(r) for r in records[:limit]]

        query_tokens = _tokenize(query)
        scored = []
        for record in records:
            record_tokens = set(record.get("keywords") or []) | _tokenize(record.get("description"))
            overlap = len(query_tokens & record_tokens)
            if overlap > 0 or query.strip().lower() == str(record.get("hsn_sac", "")).lower():
                scored.append((overlap, record))
        scored.sort(key=lambda pair: pair[0], reverse=True)
        return [self._strip(r) for _score, r in scored[:limit]]

    async def list_active(self, *, source_filter: Optional[str] = None) -> list[dict[str, Any]]:
        mongo_query: dict[str, Any] = {"is_active": True}
        if source_filter:
            mongo_query["source"] = source_filter
        records = await self.db.hsn_directory.find(mongo_query).to_list(length=10000)
        return [self._strip(r) for r in records]

    @staticmethod
    def _strip(record: dict[str, Any]) -> dict[str, Any]:
        record = dict(record)
        record.pop("_id", None)
        return record

    async def _audit(self, current_user: dict[str, Any], doc: dict[str, Any]) -> None:
        try:
            from backend.models.audit import AuditEventType
            from backend.services.audit_service import AuditService

            await AuditService(self.db).log_event(
                event_type=AuditEventType.HSN_DIRECTORY_RECORD_IMPORTED,
                actor_id=current_user.get("username"),
                actor_username=current_user.get("username"),
                actor_role=current_user.get("role"),
                entity_type="hsn_directory_record",
                entity_id=str(doc.get("hsn_sac")),
                details={
                    "hsn_sac": doc.get("hsn_sac"),
                    "source": doc.get("source"),
                    "is_official_source": doc.get("is_official_source"),
                },
            )
        except Exception:  # pragma: no cover - best-effort by contract
            pass
