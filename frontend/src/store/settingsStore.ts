import { create } from "zustand";
import { mmkvStorage } from "../services/mmkvStorage";
import { syncBackupReminderPreference } from "../services/backupReminderService";
import { ThemeService, Theme } from "../services/themeService";
import { authApi } from "../services/api/authApi";
import type {
  UserSettings,
  UserSettingsColumnVisibility,
} from "../services/api/authApi";
import { createLogger } from "../services/logging";
import {
  getScopedStorageKey,
  getScopedStorageKeyCandidates,
} from "../services/userPreferenceScope";
import {
  FontStylePreference,
  normalizeFontSizePreference,
  normalizeFontStylePreference,
  normalizeThemePreference,
} from "../theme/fontPreferences";

const log = createLogger("settingsStore");
const APP_SETTINGS_KEY = "app_settings";
const REMOTE_USER_SETTING_KEYS = new Set<keyof Settings>([
  "theme",
  "notificationsEnabled",
  "notificationSound",
  "notificationBadge",
  "autoSyncEnabled",
  "autoSyncInterval",
  "syncOnReconnect",
  "offlineMode",
  "cacheExpiration",
  "maxQueueSize",
  "scannerVibration",
  "scannerSound",
  "scannerAutoSubmit",
  "scannerTimeout",
  "fontSizeValue",
  "fontStyle",
  "showItemImages",
  "showItemPrices",
  "showItemStock",
  "exportFormat",
  "backupFrequency",
  "requireAuth",
  "sessionTimeout",
  "biometricAuth",
  "operationalMode",
  "imageCache",
  "lazyLoading",
  "debounceDelay",
  "columnVisibility",
]);
let syncTimeout: ReturnType<typeof setTimeout> | null = null;

export interface Settings {
  // Theme
  darkMode: boolean;
  theme: "light" | "dark";

  // Notifications
  notificationsEnabled: boolean;
  notificationSound: boolean;
  notificationBadge: boolean;

  // Sync
  autoSyncEnabled: boolean;
  autoSyncInterval: number;
  syncOnReconnect: boolean;

  // Offline
  offlineMode: boolean;
  cacheExpiration: number;
  maxQueueSize: number;

  // Scanner
  scannerVibration: boolean;
  scannerSound: boolean;
  scannerAutoSubmit: boolean;
  scannerTimeout: number;

  // Display
  fontSize: "small" | "medium" | "large";
  fontSizeValue: number;
  fontStyle: FontStylePreference;
  showItemImages: boolean;
  showItemPrices: boolean;
  showItemStock: boolean;

  // Data
  exportFormat: "csv" | "json";
  backupFrequency: "daily" | "weekly" | "monthly" | "never";

  // Security
  requireAuth: boolean;
  sessionTimeout: number;
  biometricAuth: boolean;
  operationalMode: "live_audit" | "routine" | "training";

  // Performance
  imageCache: boolean;
  lazyLoading: boolean;
  debounceDelay: number;

  // UI column visibility (staff item detail)
  columnVisibility: {
    mfgDate: boolean;
    expiryDate: boolean;
    serialNumber: boolean;
    mrp: boolean;
  };
}

const DEFAULT_COLUMN_VISIBILITY: Settings["columnVisibility"] = {
  mfgDate: true,
  expiryDate: true,
  serialNumber: true,
  mrp: true,
};

const SUPPORTED_OPERATIONAL_MODES = ["routine"] as const;

const DEFAULT_SETTINGS: Settings = {
  darkMode: false,
  theme: "light",
  notificationsEnabled: true,
  notificationSound: true,
  notificationBadge: true,
  autoSyncEnabled: true,
  autoSyncInterval: 15,
  syncOnReconnect: true,
  offlineMode: false,
  cacheExpiration: 24,
  maxQueueSize: 1000,
  scannerVibration: true,
  scannerSound: true,
  scannerAutoSubmit: true,
  scannerTimeout: 30,
  fontSize: "medium",
  fontSizeValue: 16,
  fontStyle: "system",
  showItemImages: true,
  showItemPrices: true,
  showItemStock: true,
  exportFormat: "csv",
  backupFrequency: "weekly",
  requireAuth: true,
  sessionTimeout: 30,
  biometricAuth: false,
  operationalMode: "routine",
  imageCache: true,
  lazyLoading: true,
  debounceDelay: 300,
  columnVisibility: DEFAULT_COLUMN_VISIBILITY,
};

const createDefaultSettings = (): Settings => ({
  ...DEFAULT_SETTINGS,
  columnVisibility: { ...DEFAULT_COLUMN_VISIBILITY },
});

const persistSettings = (settings: Settings) => {
  mmkvStorage.setItem(getScopedStorageKey(APP_SETTINGS_KEY), JSON.stringify(settings));
};

const applySettingsSideEffects = (settings: Settings) => {
  ThemeService.setTheme(settings.theme as Theme);
  void syncBackupReminderPreference(settings);
};

const deriveFontSizeLabel = (value: number): Settings["fontSize"] => {
  if (value <= 14) {
    return "small";
  }
  if (value >= 18) {
    return "large";
  }
  return "medium";
};

const normalizeBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const clampNumber = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(minimum, Math.min(maximum, Math.round(value)));
  }
  return fallback;
};

const normalizeChoice = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T => {
  return allowed.includes(value as T) ? (value as T) : fallback;
};

const normalizeColumnVisibility = (
  value: unknown,
): Settings["columnVisibility"] => {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_COLUMN_VISIBILITY };
  }

  const raw = value as Record<string, unknown>;
  return {
    mfgDate: normalizeBoolean(
      raw.mfgDate ?? raw.mfg_date,
      DEFAULT_COLUMN_VISIBILITY.mfgDate,
    ),
    expiryDate: normalizeBoolean(
      raw.expiryDate ?? raw.expiry_date,
      DEFAULT_COLUMN_VISIBILITY.expiryDate,
    ),
    serialNumber: normalizeBoolean(
      raw.serialNumber ?? raw.serial_number,
      DEFAULT_COLUMN_VISIBILITY.serialNumber,
    ),
    mrp: normalizeBoolean(raw.mrp, DEFAULT_COLUMN_VISIBILITY.mrp),
  };
};

const normalizeSettings = (settings: Settings): Settings => {
  const defaults = createDefaultSettings();
  const theme = normalizeThemePreference(settings.theme);
  const fontSizeValue = normalizeFontSizePreference(settings.fontSizeValue);

  return {
    ...defaults,
    ...settings,
    darkMode: theme === "dark",
    theme,
    notificationsEnabled: normalizeBoolean(
      settings.notificationsEnabled,
      defaults.notificationsEnabled,
    ),
    notificationSound: normalizeBoolean(
      settings.notificationSound,
      defaults.notificationSound,
    ),
    notificationBadge: normalizeBoolean(
      settings.notificationBadge,
      defaults.notificationBadge,
    ),
    autoSyncEnabled: normalizeBoolean(
      settings.autoSyncEnabled,
      defaults.autoSyncEnabled,
    ),
    autoSyncInterval: clampNumber(
      settings.autoSyncInterval,
      defaults.autoSyncInterval,
      5,
      120,
    ),
    syncOnReconnect: normalizeBoolean(
      settings.syncOnReconnect,
      defaults.syncOnReconnect,
    ),
    offlineMode: normalizeBoolean(settings.offlineMode, defaults.offlineMode),
    cacheExpiration: clampNumber(
      settings.cacheExpiration,
      defaults.cacheExpiration,
      1,
      168,
    ),
    maxQueueSize: clampNumber(
      settings.maxQueueSize,
      defaults.maxQueueSize,
      100,
      10000,
    ),
    scannerVibration: normalizeBoolean(
      settings.scannerVibration,
      defaults.scannerVibration,
    ),
    scannerSound: normalizeBoolean(
      settings.scannerSound,
      defaults.scannerSound,
    ),
    scannerAutoSubmit: normalizeBoolean(
      settings.scannerAutoSubmit,
      defaults.scannerAutoSubmit,
    ),
    scannerTimeout: clampNumber(
      settings.scannerTimeout,
      defaults.scannerTimeout,
      5,
      120,
    ),
    fontSizeValue,
    fontSize: deriveFontSizeLabel(fontSizeValue),
    fontStyle: normalizeFontStylePreference(settings.fontStyle),
    showItemImages: normalizeBoolean(
      settings.showItemImages,
      defaults.showItemImages,
    ),
    showItemPrices: normalizeBoolean(
      settings.showItemPrices,
      defaults.showItemPrices,
    ),
    showItemStock: normalizeBoolean(
      settings.showItemStock,
      defaults.showItemStock,
    ),
    exportFormat: normalizeChoice(
      settings.exportFormat,
      ["csv", "json"] as const,
      defaults.exportFormat,
    ),
    backupFrequency: normalizeChoice(
      settings.backupFrequency,
      ["daily", "weekly", "monthly", "never"] as const,
      defaults.backupFrequency,
    ),
    requireAuth: normalizeBoolean(settings.requireAuth, defaults.requireAuth),
    sessionTimeout: clampNumber(
      settings.sessionTimeout,
      defaults.sessionTimeout,
      5,
      240,
    ),
    biometricAuth: normalizeBoolean(
      settings.biometricAuth,
      defaults.biometricAuth,
    ),
    operationalMode: normalizeChoice(
      settings.operationalMode,
      SUPPORTED_OPERATIONAL_MODES,
      defaults.operationalMode,
    ),
    imageCache: normalizeBoolean(settings.imageCache, defaults.imageCache),
    lazyLoading: normalizeBoolean(settings.lazyLoading, defaults.lazyLoading),
    debounceDelay: clampNumber(
      settings.debounceDelay,
      defaults.debounceDelay,
      0,
      2000,
    ),
    columnVisibility: normalizeColumnVisibility(settings.columnVisibility),
  };
};

const fromBackendColumnVisibility = (
  value: UserSettingsColumnVisibility | undefined,
): Settings["columnVisibility"] => ({
  mfgDate: normalizeBoolean(value?.mfg_date, DEFAULT_COLUMN_VISIBILITY.mfgDate),
  expiryDate: normalizeBoolean(
    value?.expiry_date,
    DEFAULT_COLUMN_VISIBILITY.expiryDate,
  ),
  serialNumber: normalizeBoolean(
    value?.serial_number,
    DEFAULT_COLUMN_VISIBILITY.serialNumber,
  ),
  mrp: normalizeBoolean(value?.mrp, DEFAULT_COLUMN_VISIBILITY.mrp),
});

const mapBackendSettings = (backend: UserSettings): Partial<Settings> => ({
  theme: normalizeThemePreference(backend.theme),
  notificationsEnabled: normalizeBoolean(
    backend.notifications_enabled,
    DEFAULT_SETTINGS.notificationsEnabled,
  ),
  notificationSound: normalizeBoolean(
    backend.notification_sound,
    DEFAULT_SETTINGS.notificationSound,
  ),
  notificationBadge: normalizeBoolean(
    backend.notification_badge,
    DEFAULT_SETTINGS.notificationBadge,
  ),
  autoSyncEnabled: normalizeBoolean(
    backend.auto_sync_enabled,
    DEFAULT_SETTINGS.autoSyncEnabled,
  ),
  autoSyncInterval: clampNumber(
    backend.auto_sync_interval,
    DEFAULT_SETTINGS.autoSyncInterval,
    5,
    120,
  ),
  syncOnReconnect: normalizeBoolean(
    backend.sync_on_reconnect,
    DEFAULT_SETTINGS.syncOnReconnect,
  ),
  offlineMode: normalizeBoolean(
    backend.offline_mode,
    DEFAULT_SETTINGS.offlineMode,
  ),
  cacheExpiration: clampNumber(
    backend.cache_expiration,
    DEFAULT_SETTINGS.cacheExpiration,
    1,
    168,
  ),
  maxQueueSize: clampNumber(
    backend.max_queue_size,
    DEFAULT_SETTINGS.maxQueueSize,
    100,
    10000,
  ),
  scannerVibration: normalizeBoolean(
    backend.scanner_vibration,
    DEFAULT_SETTINGS.scannerVibration,
  ),
  scannerSound: normalizeBoolean(
    backend.scanner_sound,
    DEFAULT_SETTINGS.scannerSound,
  ),
  scannerAutoSubmit: normalizeBoolean(
    backend.scanner_auto_submit,
    DEFAULT_SETTINGS.scannerAutoSubmit,
  ),
  scannerTimeout: clampNumber(
    backend.scanner_timeout,
    DEFAULT_SETTINGS.scannerTimeout,
    5,
    120,
  ),
  fontSizeValue: normalizeFontSizePreference(backend.font_size),
  fontStyle: normalizeFontStylePreference(backend.font_style),
  showItemImages: normalizeBoolean(
    backend.show_item_images,
    DEFAULT_SETTINGS.showItemImages,
  ),
  showItemPrices: normalizeBoolean(
    backend.show_item_prices,
    DEFAULT_SETTINGS.showItemPrices,
  ),
  showItemStock: normalizeBoolean(
    backend.show_item_stock,
    DEFAULT_SETTINGS.showItemStock,
  ),
  exportFormat: normalizeChoice(
    backend.export_format,
    ["csv", "json"] as const,
    DEFAULT_SETTINGS.exportFormat,
  ),
  backupFrequency: normalizeChoice(
    backend.backup_frequency,
    ["daily", "weekly", "monthly", "never"] as const,
    DEFAULT_SETTINGS.backupFrequency,
  ),
  requireAuth: normalizeBoolean(
    backend.require_auth,
    DEFAULT_SETTINGS.requireAuth,
  ),
  sessionTimeout: clampNumber(
    backend.session_timeout,
    DEFAULT_SETTINGS.sessionTimeout,
    5,
    240,
  ),
  biometricAuth: normalizeBoolean(
    backend.biometric_auth,
    DEFAULT_SETTINGS.biometricAuth,
  ),
  operationalMode: normalizeChoice(
    backend.operational_mode,
    SUPPORTED_OPERATIONAL_MODES,
    DEFAULT_SETTINGS.operationalMode,
  ),
  imageCache: normalizeBoolean(backend.image_cache, DEFAULT_SETTINGS.imageCache),
  lazyLoading: normalizeBoolean(
    backend.lazy_loading,
    DEFAULT_SETTINGS.lazyLoading,
  ),
  debounceDelay: clampNumber(
    backend.debounce_delay,
    DEFAULT_SETTINGS.debounceDelay,
    0,
    2000,
  ),
  columnVisibility: fromBackendColumnVisibility(backend.column_visibility),
});

const toBackendPayload = (settings: Settings): Partial<UserSettings> => ({
  theme: normalizeThemePreference(settings.theme),
  notifications_enabled: settings.notificationsEnabled,
  notification_sound: settings.notificationSound,
  notification_badge: settings.notificationBadge,
  auto_sync_enabled: settings.autoSyncEnabled,
  auto_sync_interval: clampNumber(settings.autoSyncInterval, 15, 5, 120),
  sync_on_reconnect: settings.syncOnReconnect,
  offline_mode: settings.offlineMode,
  cache_expiration: clampNumber(settings.cacheExpiration, 24, 1, 168),
  max_queue_size: clampNumber(settings.maxQueueSize, 1000, 100, 10000),
  scanner_vibration: settings.scannerVibration,
  scanner_sound: settings.scannerSound,
  scanner_auto_submit: settings.scannerAutoSubmit,
  scanner_timeout: clampNumber(settings.scannerTimeout, 30, 5, 120),
  font_size: normalizeFontSizePreference(settings.fontSizeValue),
  font_style: normalizeFontStylePreference(settings.fontStyle),
  show_item_images: settings.showItemImages,
  show_item_prices: settings.showItemPrices,
  show_item_stock: settings.showItemStock,
  export_format: settings.exportFormat,
  backup_frequency: settings.backupFrequency,
  require_auth: settings.requireAuth,
  session_timeout: clampNumber(settings.sessionTimeout, 30, 5, 240),
  biometric_auth: settings.biometricAuth,
  operational_mode: settings.operationalMode,
  image_cache: settings.imageCache,
  lazy_loading: settings.lazyLoading,
  debounce_delay: clampNumber(settings.debounceDelay, 300, 0, 2000),
  column_visibility: {
    mfg_date: settings.columnVisibility.mfgDate,
    expiry_date: settings.columnVisibility.expiryDate,
    serial_number: settings.columnVisibility.serialNumber,
    mrp: settings.columnVisibility.mrp,
  },
});

interface SettingsState {
  settings: Settings;
  isSyncing: boolean;
  hasPendingSync: boolean;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  resetSettings: () => Promise<void>;
  loadSettings: () => Promise<void>;
  syncFromBackend: () => Promise<void>;
  syncToBackend: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: createDefaultSettings(),
  isSyncing: false,
  hasPendingSync: false,
  lastSyncedAt: null,
  lastSyncError: null,

  setSetting: (key, value) => {
    const newSettings = normalizeSettings({
      ...get().settings,
      [key]: value,
    } as Settings);
    set({ settings: newSettings });
    persistSettings(newSettings);
    applySettingsSideEffects(newSettings);

    if (REMOTE_USER_SETTING_KEYS.has(key)) {
      set({ hasPendingSync: true, lastSyncError: null });
      if (syncTimeout) {
        clearTimeout(syncTimeout);
      }
      syncTimeout = setTimeout(() => {
        void get().syncToBackend();
      }, 400);
    }
  },

  resetSettings: async () => {
    const resetSettings = normalizeSettings(createDefaultSettings());
    set({
      settings: resetSettings,
      hasPendingSync: true,
      lastSyncError: null,
    });
    persistSettings(resetSettings);
    applySettingsSideEffects(resetSettings);
    void get().syncToBackend();
  },

  loadSettings: async () => {
    try {
      let mergedSettings = createDefaultSettings();
      const activeStorageKey = getScopedStorageKey(APP_SETTINGS_KEY);

      for (const storageKey of getScopedStorageKeyCandidates(APP_SETTINGS_KEY)) {
        const storedSettings = mmkvStorage.getItem(storageKey);
        if (!storedSettings) {
          continue;
        }

        const parsedSettings = JSON.parse(storedSettings) as Partial<Settings>;
        mergedSettings = normalizeSettings({
          ...createDefaultSettings(),
          ...parsedSettings,
        } as Settings);

        if (storageKey !== activeStorageKey) {
          persistSettings(mergedSettings);
          // If we had to fall back to the legacy unscoped key, delete it after
          // migrating so a different user doesn't accidentally inherit settings.
          mmkvStorage.removeItem(storageKey);
        }
        break;
      }

      set({
        settings: mergedSettings,
        hasPendingSync: false,
        lastSyncError: null,
      });
      applySettingsSideEffects(mergedSettings);
    } catch (error) {
      log.warn("Failed to load settings", {
        error: (error as { message?: string } | null)?.message || String(error),
      });
      const fallbackSettings = createDefaultSettings();
      set({
        settings: fallbackSettings,
        hasPendingSync: false,
      });
      applySettingsSideEffects(fallbackSettings);
    }
  },

  syncFromBackend: async () => {
    if (get().isSyncing) return;
    set({ isSyncing: true });

    try {
      const backendSettings = await authApi.getUserSettings();
      const currentSettings = get().settings;
      const mergedSettings = normalizeSettings({
        ...currentSettings,
        ...mapBackendSettings(backendSettings),
      } as Settings);

      set({
        settings: mergedSettings,
        hasPendingSync: false,
        lastSyncError: null,
        lastSyncedAt: new Date().toISOString(),
      });
      persistSettings(mergedSettings);
      applySettingsSideEffects(mergedSettings);
      log.debug("Synced settings from backend");
    } catch (error) {
      const message =
        (error as { message?: string } | null)?.message || String(error);
      log.warn("Failed to sync from backend", {
        error: message,
      });
      set({ lastSyncError: message });
    } finally {
      set({ isSyncing: false });
    }
  },

  syncToBackend: async () => {
    if (get().isSyncing) return;
    set({ isSyncing: true });

    try {
      const currentSettings = normalizeSettings(get().settings);
      await authApi.updateUserSettings(toBackendPayload(currentSettings));
      set({
        hasPendingSync: false,
        lastSyncError: null,
        lastSyncedAt: new Date().toISOString(),
      });
      log.debug("Synced settings to backend");
    } catch (error) {
      const message =
        (error as { message?: string } | null)?.message || String(error);
      log.warn("Failed to sync to backend", {
        error: message,
      });
      set({
        hasPendingSync: true,
        lastSyncError: message,
      });
    } finally {
      set({ isSyncing: false });
    }
  },
}));
