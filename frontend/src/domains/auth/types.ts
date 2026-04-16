import { z } from "zod";
import { UserSchema, LoginResponseSchema } from "../../types/schemas";
import { FontStylePreference } from "../../theme/fontPreferences";

// Re-export Zod schemas
export { UserSchema, LoginResponseSchema } from "../../types/schemas";

// Inferred types
export type User = z.infer<typeof UserSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export interface UserSettingsColumnVisibility {
  mfg_date: boolean;
  expiry_date: boolean;
  serial_number: boolean;
  mrp: boolean;
}

export interface UserSettings {
  theme: "light" | "dark";
  notifications_enabled: boolean;
  notification_sound: boolean;
  notification_badge: boolean;
  auto_sync_enabled: boolean;
  auto_sync_interval: number;
  sync_on_reconnect: boolean;
  offline_mode: boolean;
  cache_expiration: number;
  max_queue_size: number;
  scanner_vibration: boolean;
  scanner_sound: boolean;
  scanner_auto_submit: boolean;
  scanner_timeout: number;
  font_size: number;
  font_style: FontStylePreference;
  show_item_images: boolean;
  show_item_prices: boolean;
  show_item_stock: boolean;
  export_format: "csv" | "json";
  backup_frequency: "daily" | "weekly" | "monthly" | "never";
  require_auth: boolean;
  session_timeout: number;
  biometric_auth: boolean;
  operational_mode: "live_audit" | "routine" | "training";
  image_cache: boolean;
  lazy_loading: boolean;
  debounce_delay: number;
  column_visibility: UserSettingsColumnVisibility;
  updated_at: string | null;
}

export interface ChangePinResponse {
  status: string;
  message: string;
  data: {
    changed_at: string;
  };
}

export interface ChangePasswordResponse {
  status: string;
  message: string;
  data: {
    changed_at: string;
  };
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface PinCredentials {
  username: string;
  pin: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}
