import { ActivityType } from "@/components/ui";

export interface DashboardStats {
  totalSessions: number;
  openSessions: number;
  closedSessions: number;
  reconciledSessions: number;
  totalItems: number;
  totalVariance: number;
  positiveVariance: number;
  negativeVariance: number;
  avgVariancePerSession: number;
  highRiskSessions: number;
}

export interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: Date;
  status?: "success" | "warning" | "error" | "info";
}

export interface ZoneOption {
  id: string;
  zone_name: string;
}

export interface WarehouseOption {
  id: string;
  warehouse_name: string;
}

export const DEFAULT_ZONES: ZoneOption[] = [
  { zone_name: "Showroom", id: "zone_showroom" },
  { zone_name: "Godown", id: "zone_godown" },
];

const SHOWROOM_WAREHOUSES: WarehouseOption[] = [
  { warehouse_name: "Ground Floor", id: "fl_ground" },
  { warehouse_name: "First Floor", id: "fl_first" },
  { warehouse_name: "Second Floor", id: "fl_second" },
];

const GODOWN_WAREHOUSES: WarehouseOption[] = [
  { warehouse_name: "Main Godown", id: "wh_main" },
  { warehouse_name: "Top Godown", id: "wh_top" },
  { warehouse_name: "Damage Area", id: "wh_damage" },
];

export const getFallbackWarehouses = (type: string): WarehouseOption[] =>
  type.toLowerCase().includes("showroom")
    ? SHOWROOM_WAREHOUSES
    : GODOWN_WAREHOUSES;
