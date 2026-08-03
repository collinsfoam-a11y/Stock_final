/**
 * Identity adapter — inventory identity + multi-location (P0E / OXS Part I).
 *
 * Maps backend DTOs to {@link InventoryIdentityViewModel} and
 * {@link MultiLocationDistributionViewModel}. Authority boundary: the adapter
 * only MAPS fields. It never constructs or compares identity keys, and it never
 * decides whether something is a duplicate — `alreadyCounted` is read verbatim
 * from the backend duplicate-governance verdict (R7).
 */

import type {
  InventoryIdentityViewModel,
  LocationRef,
  MultiLocationDistributionViewModel,
  MultiLocationEntry,
  OptionalNumber,
} from "./types";

/** Backend DTO shape for a single countable identity (loose — extra keys ignored). */
export interface IdentityDTO {
  item_code?: string;
  item_name?: string;
  batch_no?: string | null;
  serial_no?: string | null;
  floor?: string | null;
  rack?: string | null;
  warehouse?: string | null;
  /** Backend canonical identity key (e.g. "ITEM|BATCH|FLOOR|RACK"). */
  identity_key?: string;
  /** Backend duplicate verdict for this identity in this session/location. */
  already_counted?: boolean;
  existing_count_id?: string | null;
}

/** A single location entry in a multi-location distribution response. */
export interface MultiLocationEntryDTO {
  floor?: string | null;
  rack?: string | null;
  warehouse?: string | null;
  identity_key?: string;
  already_counted?: boolean;
  counted_qty?: number | null;
  existing_count_id?: string | null;
}

/** Backend DTO shape for a multi-location distribution response. */
export interface MultiLocationDTO {
  item_code?: string;
  item_name?: string;
  locations?: MultiLocationEntryDTO[];
}

const readStr = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const readNum = (v: unknown): OptionalNumber =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const toLocation = (dto: IdentityDTO | MultiLocationEntryDTO): LocationRef => ({
  floor: readStr(dto.floor),
  rack: readStr(dto.rack),
  warehouse: readStr(dto.warehouse),
});

/**
 * Maps a single identity DTO to the view model. `alreadyCounted` is the
 * backend's authoritative duplicate verdict — never recomputed.
 */
export const toInventoryIdentityViewModel = (dto: IdentityDTO): InventoryIdentityViewModel => ({
  itemCode: dto.item_code ?? "—",
  itemName: dto.item_name ?? dto.item_code ?? "Unknown item",
  batchNo: dto.batch_no ?? null,
  serialNo: dto.serial_no ?? null,
  location: toLocation(dto),
  identityKey: dto.identity_key ?? "",
  alreadyCounted: Boolean(dto.already_counted),
  existingCountId: readStr(dto.existing_count_id),
});

/**
 * Maps a multi-location distribution DTO. Each location is a distinct
 * countable identity — the adapter preserves them all without collapsing or
 * deduplicating (that is the backend's job).
 */
export const toMultiLocationDistributionViewModel = (
  dto: MultiLocationDTO
): MultiLocationDistributionViewModel => {
  const locations: MultiLocationEntry[] = (dto.locations ?? []).map((loc) => ({
    location: toLocation(loc),
    identityKey: loc.identity_key ?? "",
    alreadyCounted: Boolean(loc.already_counted),
    countedQty: readNum(loc.counted_qty),
    existingCountId: readStr(loc.existing_count_id),
  }));

  return {
    itemCode: dto.item_code ?? "—",
    itemName: dto.item_name ?? dto.item_code ?? "Unknown item",
    locations,
    totalLocations: locations.length,
  };
};
