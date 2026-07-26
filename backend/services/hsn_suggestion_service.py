"""Simplified HSN/SAC suggestion workflow (BSR Step 10).

Per explicit product direction: Stock Verify is not tax-authoritative. This
service only *suggests* likely HSN/SAC candidates from item name, category,
subcategory, brand, barcode, and photo caption/keywords -- it never
classifies HSN directly from an image, never auto-applies a suggestion, and
never mutates the SQL item master, a count_line, a preview row, or an
export row. A human must select a suggestion; selection creates a
correction proposal (see erpnext_export_correction_service.py), which still
requires admin approval and only takes effect on the next preview
regeneration. Official/manual GST verification (E-Way Bill API / GST Portal
manual search, see hsn_official_verification_service.py) remains required
before any GST-compliance claim.

Suggestion source ranking (highest to lowest trust, per the governing
source-classification policy):
  SQL_ITEM_MASTER      -- the item's own already-recorded HSN (if any)
  <directory sources>  -- GST_PORTAL_DIRECTORY / OFFICIAL_CBIC_REFERENCE
                          (official) rank above MCP_INDIA_STACK_SEED /
                          OPEN_SOURCE_SEED (never official)
No suggestion source may auto-approve HSN/GST; every suggestion carries
`verification_status="SUGGESTED_NOT_VERIFIED"` (or
`"INTERNAL_SQL_CONSISTENCY_ONLY"` for the SQL-item-master case) and
`requires_manual_verification=True`.
"""

from __future__ import annotations

import re
from typing import Any, Optional, Protocol

from backend.services.hsn_directory_service import HsnDirectoryService

MCP_INDIA_STACK_SOURCE = "MCP_INDIA_STACK_SEED"
MCP_INDIA_STACK_SOURCE_URL = "https://github.com/rehan1020/MCP-India-Stack"

# Confidence cap for any suggestion whose ONLY matching signal came from the
# photo caption/keywords (no item_name/category/subcategory/brand overlap)
# -- per Part E: "Photo-only match confidence must be capped."
_PHOTO_ONLY_CONFIDENCE_CAP = 0.5
# Further cap applied when the photo signal actively disagrees with the
# item's own name/category (both present, zero token overlap between them).
_PHOTO_CONFLICT_CONFIDENCE_CAP = 0.35

_OFFICIAL_SOURCE_BOOST = 0.15
_CATEGORY_MATCH_BOOST = 0.1

DEFAULT_ENABLED_SOURCES = frozenset({"sql_item_master", "hsn_directory", "mcp_india_stack"})


def _tokenize(*parts: Optional[str]) -> set[str]:
    text = " ".join(str(p) for p in parts if p)
    return {tok for tok in re.findall(r"[a-z0-9]+", text.lower()) if len(tok) > 1}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    union = a | b
    if not union:
        return 0.0
    return len(a & b) / len(union)


class McpIndiaStackSeedSource(Protocol):
    """Swap in a real live MCP India Stack client here if one becomes
    available; the one implementation shipped today
    (`StaticMcpIndiaStackSeedSource`) is a small, honestly-labeled local
    seed curated from that project's real, publicly downloaded
    `hsn_master.csv` dataset -- not a live connection to the MCP server
    itself (no confirmed live network path to it was available in this
    environment). Every record is always source-tagged `MCP_INDIA_STACK_SEED`
    regardless of which implementation is plugged in."""

    def search(self, tokens: set[str], *, limit: int = 10) -> list[dict[str, Any]]:
        ...


# Curated from the real, public hsn_master.csv shipped in
# https://github.com/rehan1020/MCP-India-Stack (fetched directly from that
# repository's main branch). GST rate columns in that dataset are almost
# entirely unpopulated (only 199 of 22,544 rows have a nonzero rate) --
# rather than fabricate a rate the source doesn't actually provide,
# `gst_percentage` is left `None` for every entry here exactly as the real
# source has it. HSN codes and descriptions are the genuine, real values.
_MCP_INDIA_STACK_SEED_DATA: list[dict[str, Any]] = [
    {"hsn_sac": "731815", "description": "OTHER SCREWS AND BOLTS, WHETHER OR NOT WITH THEIR NUTS OR WASHERS", "gst_percentage": None, "keywords": ["screw", "bolt", "nut", "washer", "fastener", "hardware"]},
    {"hsn_sac": "854140", "description": "Photosensitive semi-conductor devices, including photo voltaic cells whether or not assembled in modules or made up into panels; light-emitting diodes (LED)", "gst_percentage": None, "keywords": ["led", "light", "emitting", "diode", "semiconductor"]},
    {"hsn_sac": "853910", "description": "SEALED BEAM LAMP UNITS", "gst_percentage": None, "keywords": ["lamp", "bulb", "lighting", "sealed", "beam"]},
    {"hsn_sac": "85392990", "description": "OTHER (bulbs)", "gst_percentage": None, "keywords": ["bulb", "lamp", "lighting"]},
    {"hsn_sac": "854460", "description": "OTHER ELECTRIC CONDUCTORS, FOR A VOLTAGE NOT EXCEEDING 1,000V", "gst_percentage": None, "keywords": ["cable", "wire", "conductor", "electrical"]},
    {"hsn_sac": "854420", "description": "CO-AXIAL CABLE AND OTHER CO-AXIAL ELECTRIC CONDUCTORS", "gst_percentage": None, "keywords": ["cable", "coaxial", "wire", "conductor"]},
    {"hsn_sac": "732393", "description": "OF STAINLESS STEEL (table, kitchen or household articles)", "gst_percentage": None, "keywords": ["kitchen", "steel", "stainless", "utensil", "cookware", "household"]},
    {"hsn_sac": "853650", "description": "OTHER SWITCHES", "gst_percentage": None, "keywords": ["switch", "electrical", "socket"]},
    {"hsn_sac": "853661", "description": "LAMPHOLDERS", "gst_percentage": None, "keywords": ["lampholder", "lamp", "fitting", "lighting"]},
    {"hsn_sac": "850680", "description": "OTHER PRIMARY CELLS AND PRIMARY BATTERIES", "gst_percentage": None, "keywords": ["battery", "cell", "power"]},
]


class StaticMcpIndiaStackSeedSource:
    """The only McpIndiaStackSeedSource implementation available in this
    environment -- see module docstring for provenance and honesty notes."""

    def search(self, tokens: set[str], *, limit: int = 10) -> list[dict[str, Any]]:
        scored = []
        for entry in _MCP_INDIA_STACK_SEED_DATA:
            record_tokens = set(entry["keywords"]) | _tokenize(entry["description"])
            score = _jaccard(tokens, record_tokens)
            if score > 0:
                scored.append((score, entry))
        scored.sort(key=lambda pair: pair[0], reverse=True)
        return [entry for _score, entry in scored[:limit]]


class HsnSuggestionService:
    def __init__(
        self,
        db: Any,
        *,
        mcp_source: Optional[McpIndiaStackSeedSource] = None,
        enabled_sources: Optional[frozenset[str]] = None,
    ) -> None:
        self.db = db
        self.directory_service = HsnDirectoryService(db)
        self.mcp_source = mcp_source or StaticMcpIndiaStackSeedSource()
        self.enabled_sources = enabled_sources if enabled_sources is not None else DEFAULT_ENABLED_SOURCES

    async def suggest(
        self,
        *,
        item_code: str,
        item_name: Optional[str] = None,
        category: Optional[str] = None,
        subcategory: Optional[str] = None,
        brand: Optional[str] = None,
        barcode: Optional[str] = None,
        photo_caption: Optional[str] = None,
        limit: int = 5,
    ) -> dict[str, Any]:
        suggestions: list[dict[str, Any]] = []

        name_tokens = _tokenize(item_name, category, subcategory, brand, barcode)
        photo_tokens = _tokenize(photo_caption)
        category_tokens = _tokenize(category, subcategory)
        combined_tokens = name_tokens | photo_tokens
        # A genuine conflict requires both signals present and disagreeing.
        photo_conflicts_with_name = bool(name_tokens) and bool(photo_tokens) and not (name_tokens & photo_tokens)

        if "sql_item_master" in self.enabled_sources and item_code:
            erp_item = await self.db.erp_items.find_one({"item_code": item_code})
            if erp_item and erp_item.get("hsn_code"):
                suggestions.append(
                    {
                        "hsn_sac": erp_item["hsn_code"],
                        "description": None,
                        "gst_percentage": erp_item.get("gst_percent"),
                        "source": "SQL_ITEM_MASTER",
                        "source_url": None,
                        "is_official_source": False,
                        "confidence": 1.0,
                        "match_reason": "Already recorded on this item's ERP master",
                        "verification_status": "INTERNAL_SQL_CONSISTENCY_ONLY",
                        "requires_manual_verification": True,
                    }
                )

        if "hsn_directory" in self.enabled_sources:
            directory_records = await self.directory_service.list_active()
            for record in directory_records:
                self._score_and_append(
                    suggestions,
                    hsn_sac=record["hsn_sac"],
                    description=record.get("description"),
                    gst_percentage=record.get("gst_percentage"),
                    source=record["source"],
                    source_url=record.get("source_url"),
                    is_official_source=bool(record.get("is_official_source")),
                    record_tokens=set(record.get("keywords") or []) | _tokenize(record.get("description")),
                    name_tokens=name_tokens,
                    photo_tokens=photo_tokens,
                    combined_tokens=combined_tokens,
                    category_tokens=category_tokens,
                    photo_conflicts_with_name=photo_conflicts_with_name,
                )

        if "mcp_india_stack" in self.enabled_sources:
            for entry in self.mcp_source.search(combined_tokens, limit=limit * 2):
                record_tokens = set(entry.get("keywords") or []) | _tokenize(entry.get("description"))
                self._score_and_append(
                    suggestions,
                    hsn_sac=entry["hsn_sac"],
                    description=entry.get("description"),
                    gst_percentage=entry.get("gst_percentage"),
                    source=MCP_INDIA_STACK_SOURCE,
                    source_url=MCP_INDIA_STACK_SOURCE_URL,
                    is_official_source=False,
                    record_tokens=record_tokens,
                    name_tokens=name_tokens,
                    photo_tokens=photo_tokens,
                    combined_tokens=combined_tokens,
                    category_tokens=category_tokens,
                    photo_conflicts_with_name=photo_conflicts_with_name,
                )

        suggestions.sort(key=lambda s: s["confidence"], reverse=True)
        return {"item_code": item_code, "suggestions": suggestions[:limit]}

    @staticmethod
    def _score_and_append(
        suggestions: list[dict[str, Any]],
        *,
        hsn_sac: str,
        description: Optional[str],
        gst_percentage: Optional[float],
        source: str,
        source_url: Optional[str],
        is_official_source: bool,
        record_tokens: set[str],
        name_tokens: set[str],
        photo_tokens: set[str],
        combined_tokens: set[str],
        category_tokens: set[str],
        photo_conflicts_with_name: bool,
    ) -> None:
        name_overlap = name_tokens & record_tokens
        photo_overlap = photo_tokens & record_tokens
        if not name_overlap and not photo_overlap:
            return

        confidence = _jaccard(combined_tokens, record_tokens)
        photo_only = bool(photo_overlap) and not bool(name_overlap)

        reasons = []
        if name_overlap:
            reasons.append(f"item_name/category/brand match ({', '.join(sorted(name_overlap))})")
        if photo_overlap:
            reasons.append(f"photo caption match ({', '.join(sorted(photo_overlap))})")

        if category_tokens & record_tokens:
            confidence = min(1.0, confidence + _CATEGORY_MATCH_BOOST)
        if is_official_source:
            confidence = min(1.0, confidence + _OFFICIAL_SOURCE_BOOST)

        result: dict[str, Any] = {
            "hsn_sac": hsn_sac,
            "description": description,
            "gst_percentage": gst_percentage,
            "source": source,
            "source_url": source_url,
            "is_official_source": is_official_source,
            "match_reason": "; ".join(reasons),
            "verification_status": "SUGGESTED_NOT_VERIFIED",
            "requires_manual_verification": True,
        }

        if photo_only and photo_conflicts_with_name:
            confidence = min(confidence, _PHOTO_CONFLICT_CONFIDENCE_CAP)
            result["review_warning"] = "PHOTO_CONFLICTS_WITH_ITEM_NAME_CATEGORY"
        elif photo_only:
            confidence = min(confidence, _PHOTO_ONLY_CONFIDENCE_CAP)

        result["confidence"] = round(confidence, 2)
        suggestions.append(result)
