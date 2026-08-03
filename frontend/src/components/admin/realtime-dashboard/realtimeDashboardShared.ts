import { Platform } from "react-native";

export interface Column {
  field: string;
  label: string;
  visible: boolean;
  sortable: boolean;
  filterable: boolean;
  width?: number;
  format?: string;
}

export interface DashboardItem {
  id: string;
  item_code: string;
  item_name: string;
  barcode?: string;
  category?: string;
  warehouse?: string;
  floor?: string;
  rack_id?: string;
  stock_qty: number;
  counted_qty: number;
  variance: number;
  variance_percentage: number;
  mrp: number;
  verified: boolean;
  verified_by?: string;
  verified_at?: string;
  counted_by: string;
  counted_at: string;
  session_id: string;
  notes?: string;
  status?: string;
}

export interface DashboardStats {
  total_items: number;
  verified_items: number;
  pending_items: number;
  today_activity: number;
  total_variance: number;
  positive_variance: number;
  negative_variance: number;
  verification_rate: number;
}

export interface Pagination {
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface Summary {
  total_records: number;
  filtered_records: number;
  aggregations: Record<string, number>;
  generated_at: string;
  generation_time_ms: number;
}

export const IS_WEB = Platform.OS === "web";

export const formatValue = (value: unknown, format?: string): string => {
  if (value === null || value === undefined) return "-";

  switch (format) {
    case "date":
      try {
        const date = new Date(String(value));
        return date.toLocaleDateString() + " " + date.toLocaleTimeString();
      } catch {
        return String(value);
      }
    case "currency":
      return `₹${Number(value).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
      })}`;
    case "percentage":
      return `${Number(value).toFixed(2)}%`;
    case "number":
      return Number(value).toLocaleString();
    default:
      if (typeof value === "boolean") return value ? "Yes" : "No";
      return String(value);
  }
};
