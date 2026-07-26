"""HSN/SAC + GST validation (BSR).

**No live official HSN/GST source is integrated.** This environment has no
confirmed access to a real CBIC/GST HSN API or a licensed HSN dataset (see
docs/BSR_REMEDIATION_STATUS.md Step 8 for why). Per explicit user decision,
this service is a *pluggable placeholder*: `_LOCAL_SEED_HSN_REFERENCE` is a
small, clearly-labeled stand-in dataset, not an authoritative GST/HSN
master. Every result this service produces carries
`source="LOCAL_SEED_PLACEHOLDER_PENDING_OFFICIAL_SOURCE"` so nothing
downstream can mistake it for an official validation. Swapping in a real
official source later means implementing `HsnReferenceSource` and passing
it into `HsnGstValidationService(db, reference_source=...)` -- no other
code should need to change.

Never calls out to SQL Server or ERPNext. Never mutates an item master,
count-line, preview row, or export row -- only ever returns suggestions
that require explicit human approval (via the existing correction-proposal
workflow) before they can affect anything.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any, Protocol

PLACEHOLDER_SOURCE = "LOCAL_SEED_PLACEHOLDER_PENDING_OFFICIAL_SOURCE"

# GST HSN/SAC codes are numeric strings at the 4/6/8-digit chapter/heading/
# subheading/tariff-item level. This is general, documented GST structure,
# not specific to any item -- used only for format validation, never to
# fabricate a specific code's correctness.
_VALID_HSN_LENGTHS = (4, 6, 8)


class HsnReferenceSource(Protocol):
    """Swap in a real implementation (CBIC API client, licensed dataset
    reader, ERPNext India Compliance HSN master reader, etc.) to replace
    the placeholder below without touching HsnGstValidationService."""

    def suggest(
        self, *, item_name: str, category: str | None, subcategory: str | None, brand: str | None
    ) -> list[dict[str, Any]]: ...


# Explicitly a stand-in, not a real GST HSN master. Keyed by lowercase
# keyword found in category/subcategory/item_name. Real official source
# required before this can be trusted for actual GST filing decisions.
_LOCAL_SEED_HSN_REFERENCE: list[dict[str, Any]] = [
    {
        "keywords": ("fastener", "screw", "bolt", "nut", "hardware"),
        "hsn_6_digit": "731815",
        "description": "Threaded screws and bolts of iron or steel (placeholder reference only)",
        "gst_rate_candidates": [18],
    },
    {
        "keywords": ("electronic", "electrical", "cable", "wire"),
        "hsn_6_digit": "854449",
        "description": "Other electric conductors, for a voltage not exceeding 1,000 V (placeholder reference only)",
        "gst_rate_candidates": [18],
    },
    {
        "keywords": ("kitchen", "cookware", "utensil"),
        "hsn_6_digit": "732393",
        "description": "Table, kitchen or other household articles of stainless steel (placeholder reference only)",
        "gst_rate_candidates": [12, 18],
    },
]


class LocalSeedHsnReferenceSource:
    """The only HsnReferenceSource implementation available in this
    environment. Explicitly labeled as a placeholder in every result it
    produces -- see module docstring."""

    def suggest(
        self, *, item_name: str, category: str | None, subcategory: str | None, brand: str | None
    ) -> list[dict[str, Any]]:
        haystack = " ".join(
            str(part).lower() for part in (item_name, category, subcategory, brand) if part
        )
        matches = []
        for entry in _LOCAL_SEED_HSN_REFERENCE:
            if any(keyword in haystack for keyword in entry["keywords"]):
                matches.append(
                    {
                        "hsn_6_digit": entry["hsn_6_digit"],
                        "description": entry["description"],
                        "confidence": "medium",
                        "source": PLACEHOLDER_SOURCE,
                        "gst_rate_candidates": entry["gst_rate_candidates"],
                        "reason": "item_name/category/subcategory keyword match against a local placeholder reference",
                    }
                )
        return matches


def _is_valid_hsn_format(hsn_sac: str) -> bool:
    return hsn_sac.isdigit() and len(hsn_sac) in _VALID_HSN_LENGTHS


def _cache_key(hsn_sac: str | None, gst_percentage: float | None) -> str:
    raw = f"{hsn_sac}:{gst_percentage}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class HsnGstValidationService:
    def __init__(self, db: Any, *, reference_source: HsnReferenceSource | None = None) -> None:
        self.db = db
        self.reference_source = reference_source or LocalSeedHsnReferenceSource()

    async def validate_hsn(
        self,
        *,
        hsn_sac: str | None,
        gst_percentage: float | None,
        sgst_percent: float | None,
        cgst_percent: float | None,
        igst_percent: float | None,
        is_non_gst: bool,
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        """Returns hsn_validation_status/source/validated_at plus any
        internal-consistency mismatch found. Caches the result keyed by
        (hsn_sac, gst_percentage) with source+timestamp, and audits the
        first time a given key is validated (idempotent on repeat calls)."""
        if is_non_gst:
            return {
                "hsn_validation_status": "NOT_APPLICABLE",
                "hsn_validation_source": PLACEHOLDER_SOURCE,
                "hsn_validated_at": None,
                "gst_rate_mismatch": False,
            }

        if not hsn_sac:
            return {
                "hsn_validation_status": "MISSING",
                "hsn_validation_source": PLACEHOLDER_SOURCE,
                "hsn_validated_at": None,
                "gst_rate_mismatch": False,
            }

        status = "VALID" if _is_valid_hsn_format(str(hsn_sac)) else "INVALID"

        gst_rate_mismatch = False
        if status == "VALID" and gst_percentage is not None:
            intra_state_total = (sgst_percent or 0.0) + (cgst_percent or 0.0)
            matches_intra_state = (
                sgst_percent is not None
                and cgst_percent is not None
                and abs(gst_percentage - intra_state_total) < 0.01
            )
            matches_inter_state = (
                igst_percent is not None and abs(gst_percentage - igst_percent) < 0.01
            )
            if (
                not matches_intra_state
                and not matches_inter_state
                and (
                    sgst_percent is not None or cgst_percent is not None or igst_percent is not None
                )
            ):
                gst_rate_mismatch = True

        cache_key = _cache_key(str(hsn_sac), gst_percentage)
        existing = await self.db.hsn_validation_cache.find_one({"cache_key": cache_key})
        validated_at = datetime.now(timezone.utc)
        if existing is None:
            await self.db.hsn_validation_cache.insert_one(
                {
                    "cache_key": cache_key,
                    "hsn_sac": str(hsn_sac),
                    "gst_percentage": gst_percentage,
                    "status": status,
                    "source": PLACEHOLDER_SOURCE,
                    "validated_at": validated_at,
                }
            )
            await self._audit_validated(current_user, hsn_sac, gst_percentage, status)
        else:
            validated_at = existing.get("validated_at") or validated_at

        return {
            "hsn_validation_status": status,
            "hsn_validation_source": PLACEHOLDER_SOURCE,
            "hsn_validated_at": (
                validated_at.isoformat() if isinstance(validated_at, datetime) else validated_at
            ),
            "gst_rate_mismatch": gst_rate_mismatch,
        }

    def suggest_hsn_candidates(
        self,
        *,
        item_name: str,
        category: str | None,
        subcategory: str | None,
        brand: str | None,
    ) -> list[dict[str, Any]]:
        """Always returns 6-digit HSN candidates only -- never 4-digit
        headings -- per explicit correction to this requirement. Every
        candidate requires human approval before it can be applied to
        anything; this call alone never mutates any row."""
        return self.reference_source.suggest(
            item_name=item_name, category=category, subcategory=subcategory, brand=brand
        )

    async def _audit_validated(
        self,
        current_user: dict[str, Any],
        hsn_sac: str,
        gst_percentage: float | None,
        status: str,
    ) -> None:
        try:
            from backend.models.audit import AuditEventType
            from backend.services.audit_service import AuditService

            await AuditService(self.db).log_event(
                event_type=AuditEventType.EXPORT_HSN_GST_VALIDATED,
                actor_id=current_user.get("username"),
                actor_username=current_user.get("username"),
                actor_role=current_user.get("role"),
                entity_type="hsn_validation_cache",
                entity_id=str(hsn_sac),
                details={
                    "hsn_sac": hsn_sac,
                    "gst_percentage": gst_percentage,
                    "status": status,
                    "source": PLACEHOLDER_SOURCE,
                },
            )
        except Exception:  # pragma: no cover - best-effort by contract
            pass
