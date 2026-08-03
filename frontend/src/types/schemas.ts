import { z } from "zod";

/**
 * Standard API Response Schema
 */
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
    message: z.string().optional(),
    timestamp: z.string().optional(),
    request_id: z.string().optional(),
  });

/**
 * Item Schema
 */
export const ItemSchema = z.object({
  item_code: z.string(),
  item_name: z.string(),
  barcode: z.string().optional(),
  mrp: z.number().optional(),
  stock_qty: z.number().optional(),
  current_stock: z.number().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  uom_name: z.string().optional(),
  uom_code: z.string().optional(),
  uom: z.string().optional(),
  warehouse: z.string().optional(),
  image_url: z.string().optional(),
  description: z.string().optional(),
  sales_price: z.number().optional(),
  sale_price: z.number().optional(),
  manual_barcode: z.string().optional(),
  unit2_barcode: z.string().optional(),
  unit_m_barcode: z.string().optional(),
  batch_id: z.string().optional(),
});

/**
 * User Schema
 */
export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().email().optional(),
  role: z.string(),
  permissions: z.array(z.string()).optional(),
});

/**
 * Login Response Schema
 */
export const LoginResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string(),
  user: UserSchema,
});

/**
 * Date format for flexible date fields (full / month_year / year_only / none)
 */
export const DateFormatSchema = z.enum(["full", "month_year", "year_only", "none"]);
export type DateFormatType = z.infer<typeof DateFormatSchema>;

/**
 * Serial entry for serialized items with per-serial attributes.
 * Mirrors the inline serial_entries[] shape of CreateCountLinePayload.
 */
export const SerialEntrySchema = z.object({
  serial_number: z.string().min(1),
  mrp: z.number().optional(),
  manufacturing_date: z.string().optional(),
  mfg_date_format: DateFormatSchema.optional(),
  expiry_date: z.string().optional(),
  expiry_date_format: DateFormatSchema.optional(),
});
export type SerialEntryInput = z.infer<typeof SerialEntrySchema>;

/**
 * Count line batch (used for multi-batch counting and autosave drafts).
 * Mirrors the CountLineBatch interface in types/scan.ts.
 */
export const CountLineBatchSchema = z.object({
  quantity: z.number(),
  mrp: z.number().optional(),
  manufacturing_date: z.string().optional(),
  item_condition: z.string().optional(),
  condition_details: z.string().optional(),
  batch_number: z.string().optional(),
  expiry_date: z.string().optional(),
  batch_no: z.string().optional(),
  barcode: z.string().optional(),
  stock_qty: z.number().optional(),
});
export type CountLineBatchInput = z.infer<typeof CountLineBatchSchema>;

/**
 * CreateCountLinePayload schema — the runtime validation boundary for the
 * count-line API. This mirrors the CreateCountLinePayload interface in
 * types/scan.ts so the frontend can validate payloads before they are sent
 * to /api/count-lines (or persisted offline for later replay).
 *
 * Validation is intentionally fail-open: a payload that fails validation is
 * logged, but still forwarded so offline/online flows are never blocked by a
 * schema drift between the frontend and backend.
 */
export const CountLinePayloadSchema = z.object({
  session_id: z.string().min(1),
  recount_of_id: z.string().optional(),
  item_code: z.string().min(1),
  item_name: z.string().optional(),
  barcode: z.string().optional(),
  batch_id: z.string().optional(),
  counted_qty: z.number().finite(),
  damaged_qty: z.number().finite().optional(),
  damage_included: z.boolean().optional(),
  non_returnable_damaged_qty: z.number().finite().optional(),
  variance_reason: z.string().nullable().optional(),
  variance_note: z.string().nullable().optional(),
  correction_reason: z.string().nullable().optional(),
  remark: z.string().nullable().optional(),
  item_condition: z.string().optional(),
  condition_details: z.string().optional(),
  serial_numbers: z.array(z.string()).optional(),
  serial_entries: z.array(SerialEntrySchema).optional(),
  floor_no: z.string().nullable().optional(),
  rack_no: z.string().nullable().optional(),
  mark_location: z.string().nullable().optional(),
  sr_no: z.string().nullable().optional(),
  manufacturing_date: z.string().nullable().optional(),
  mfg_date_format: DateFormatSchema.optional(),
  expiry_date: z.string().nullable().optional(),
  expiry_date_format: DateFormatSchema.optional(),
  photo_base64: z.string().optional(),
  mrp_counted: z.number().finite().optional(),
  mrp_source: z.string().optional(),
  variant_id: z.string().optional(),
  variant_barcode: z.string().optional(),
  category_correction: z.string().optional(),
  subcategory_correction: z.string().optional(),
  batches: z.array(CountLineBatchSchema).optional(),
  idempotency_key: z.string().optional(),
});
export type CountLinePayloadInput = z.infer<typeof CountLinePayloadSchema>;

export type Item = z.infer<typeof ItemSchema>;
export type User = z.infer<typeof UserSchema>;
