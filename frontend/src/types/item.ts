/**
 * Re-export Item from scan.ts as the canonical source
 * This maintains backward compatibility while eliminating duplicate definitions
 */
export { Item } from "./scan";

export interface InventoryItemAlias {
  alias_type: "item_code" | "barcode" | "manual_barcode" | "unit2_barcode" | "unit_m_barcode";
  value: string;
  normalized_value: string;
}

export interface CanonicalInventoryIdentity {
  id: string;
  canonical_code: string;
  normalized_code: string;
  display_name: string;
  aliases: InventoryItemAlias[];
  source_record_ids: string[];
  active: boolean;
  version: number;
  collision_state?: string | null;
}

/**
 * MRP Variant - different MRP values for the same item
 * Extended version with more fields than scan.ts NormalizedMrpVariant
 */
export interface MRPVariant {
  mrp: number;
  barcode?: string;
  effective_date?: string;
  source?: string;
}

/**
 * MRP History entry
 */
export interface MRPHistory {
  mrp: number;
  changed_at: string;
  changed_by?: string;
  reason?: string;
}

/**
 * Search Result - Simplified item data for search results
 */
export interface SearchResult {
  item_code: string;
  item_name: string;
  barcode?: string;
  mrp?: number;
  stock_qty?: number;
  category?: string;
  subcategory?: string;
  uom_name?: string;
  warehouse?: string;
  image_url?: string;
}

/**
 * Count Line - Item count entry in a session
 */
export interface CountLine {
  id: string;
  session_id: string;
  item_code: string;
  item_name: string;
  barcode?: string;
  counted_qty: number;
  system_qty?: number;
  variance?: number;
  variance_percentage?: number;
  mrp?: number;
  verified: boolean;
  verified_by?: string;
  verified_at?: string;
  notes?: string;
  location?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Create Count Line Request
 */
export interface CreateCountLineRequest {
  session_id: string;
  item_code: string;
  counted_qty: number;
  barcode?: string;
  location?: string;
  notes?: string;
}

/**
 * Update Count Line Request
 */
export interface UpdateCountLineRequest {
  counted_qty?: number;
  verified?: boolean;
  notes?: string;
  location?: string;
}
