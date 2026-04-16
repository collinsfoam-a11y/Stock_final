type BackendSettingsOverrides = Partial<
  import("../../services/api/authApi").UserSettings
>;

const buildBackendSettings = (
  overrides: BackendSettingsOverrides = {},
): import("../../services/api/authApi").UserSettings => ({
  theme: "light",
  notifications_enabled: true,
  notification_sound: true,
  notification_badge: true,
  auto_sync_enabled: true,
  auto_sync_interval: 15,
  sync_on_reconnect: true,
  offline_mode: false,
  cache_expiration: 24,
  max_queue_size: 1000,
  scanner_vibration: true,
  scanner_sound: true,
  scanner_auto_submit: true,
  scanner_timeout: 30,
  font_size: 16,
  font_style: "system",
  show_item_images: true,
  show_item_prices: true,
  show_item_stock: true,
  export_format: "csv",
  backup_frequency: "weekly",
  require_auth: true,
  session_timeout: 30,
  biometric_auth: false,
  operational_mode: "routine",
  image_cache: true,
  lazy_loading: true,
  debounce_delay: 300,
  column_visibility: {
    mfg_date: true,
    expiry_date: true,
    serial_number: true,
    mrp: true,
  },
  updated_at: null,
  ...overrides,
});

describe("settingsStore user scope", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("keeps theme and font preferences isolated per user on the same device", async () => {
    const storage = new Map<string, string>();
    const updateUserSettings = jest.fn(async () => buildBackendSettings());
    const getUserSettings = jest.fn(async () => buildBackendSettings());
    const setTheme = jest.fn();

    jest.doMock("../../services/mmkvStorage", () => ({
      __esModule: true,
      mmkvStorage: {
        getItem: jest.fn((key: string) => storage.get(key) ?? null),
        getItemAsync: jest.fn(async (key: string) => storage.get(key) ?? null),
        setItem: jest.fn((key: string, value: string) => {
          storage.set(key, value);
        }),
        removeItem: jest.fn((key: string) => {
          storage.delete(key);
        }),
        clearAll: jest.fn(() => {
          storage.clear();
        }),
        flush: jest.fn(async () => undefined),
        initialize: jest.fn(async () => undefined),
      },
    }));

    jest.doMock("../../services/api/authApi", () => ({
      __esModule: true,
      authApi: {
        getUserSettings,
        updateUserSettings,
      },
      default: {
        getUserSettings,
        updateUserSettings,
      },
    }));

    jest.doMock("../../services/themeService", () => ({
      __esModule: true,
      ThemeService: {
        initialize: jest.fn(async () => undefined),
        getTheme: jest.fn(),
        setTheme,
        subscribe: jest.fn(() => jest.fn()),
      },
    }));

    jest.doMock("../../services/backupReminderService", () => ({
      __esModule: true,
      syncBackupReminderPreference: jest.fn(async () => undefined),
    }));

    jest.doMock("../../services/logging", () => ({
      __esModule: true,
      createLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      }),
    }));

    let useSettingsStore!: typeof import("../settingsStore").useSettingsStore;
    let setUserPreferenceScope!: typeof import("../../services/userPreferenceScope").setUserPreferenceScope;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ useSettingsStore } = require("../settingsStore"));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ setUserPreferenceScope } = require("../../services/userPreferenceScope"));
    });

    setUserPreferenceScope("user-a");
    await useSettingsStore.getState().loadSettings();

    useSettingsStore.getState().setSetting("theme", "dark");
    useSettingsStore.getState().setSetting("fontSizeValue", 18);
    useSettingsStore.getState().setSetting("fontStyle", "serif");

    jest.advanceTimersByTime(450);
    await Promise.resolve();

    setUserPreferenceScope("user-b");
    await useSettingsStore.getState().loadSettings();

    expect(useSettingsStore.getState().settings.theme).toBe("light");
    expect(useSettingsStore.getState().settings.fontSizeValue).toBe(16);
    expect(useSettingsStore.getState().settings.fontStyle).toBe("system");

    useSettingsStore.getState().setSetting("fontSizeValue", 14);
    useSettingsStore.getState().setSetting("fontStyle", "mono");

    jest.advanceTimersByTime(450);
    await Promise.resolve();

    setUserPreferenceScope("user-a");
    await useSettingsStore.getState().loadSettings();

    expect(useSettingsStore.getState().settings.theme).toBe("dark");
    expect(useSettingsStore.getState().settings.fontSizeValue).toBe(18);
    expect(useSettingsStore.getState().settings.fontStyle).toBe("serif");

    setUserPreferenceScope("user-b");
    await useSettingsStore.getState().loadSettings();

    expect(useSettingsStore.getState().settings.theme).toBe("light");
    expect(useSettingsStore.getState().settings.fontSizeValue).toBe(14);
    expect(useSettingsStore.getState().settings.fontStyle).toBe("mono");

    expect(storage.has("app_settings:user-a")).toBe(true);
    expect(storage.has("app_settings:user-b")).toBe(true);
    expect(storage.get("app_settings:user-a")).not.toEqual(
      storage.get("app_settings:user-b"),
    );
    expect(updateUserSettings).toHaveBeenCalledTimes(2);
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("migrates legacy unscoped settings into the active user scope on load", async () => {
    const storage = new Map<string, string>([
      [
        "app_settings",
        JSON.stringify({
          theme: "dark",
          fontSizeValue: 18,
          fontStyle: "serif",
        }),
      ],
    ]);

    jest.doMock("../../services/mmkvStorage", () => ({
      __esModule: true,
      mmkvStorage: {
        getItem: jest.fn((key: string) => storage.get(key) ?? null),
        getItemAsync: jest.fn(async (key: string) => storage.get(key) ?? null),
        setItem: jest.fn((key: string, value: string) => {
          storage.set(key, value);
        }),
        removeItem: jest.fn((key: string) => {
          storage.delete(key);
        }),
        clearAll: jest.fn(() => {
          storage.clear();
        }),
        flush: jest.fn(async () => undefined),
        initialize: jest.fn(async () => undefined),
      },
    }));

    jest.doMock("../../services/api/authApi", () => ({
      __esModule: true,
      authApi: {
        getUserSettings: jest.fn(async () => buildBackendSettings()),
        updateUserSettings: jest.fn(async () => buildBackendSettings()),
      },
      default: {
        getUserSettings: jest.fn(async () => buildBackendSettings()),
        updateUserSettings: jest.fn(async () => buildBackendSettings()),
      },
    }));

    jest.doMock("../../services/themeService", () => ({
      __esModule: true,
      ThemeService: {
        initialize: jest.fn(async () => undefined),
        getTheme: jest.fn(),
        setTheme: jest.fn(),
        subscribe: jest.fn(() => jest.fn()),
      },
    }));

    jest.doMock("../../services/backupReminderService", () => ({
      __esModule: true,
      syncBackupReminderPreference: jest.fn(async () => undefined),
    }));

    jest.doMock("../../services/logging", () => ({
      __esModule: true,
      createLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      }),
    }));

    let useSettingsStore!: typeof import("../settingsStore").useSettingsStore;
    let setUserPreferenceScope!: typeof import("../../services/userPreferenceScope").setUserPreferenceScope;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ useSettingsStore } = require("../settingsStore"));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ setUserPreferenceScope } = require("../../services/userPreferenceScope"));
    });

    setUserPreferenceScope("legacy-user");
    await useSettingsStore.getState().loadSettings();

    expect(useSettingsStore.getState().settings.theme).toBe("dark");
    expect(useSettingsStore.getState().settings.fontSizeValue).toBe(18);
    expect(useSettingsStore.getState().settings.fontStyle).toBe("serif");

    const migratedSettings = JSON.parse(
      storage.get("app_settings:legacy-user") ?? "{}",
    ) as Record<string, unknown>;

    expect(migratedSettings.theme).toBe("dark");
    expect(migratedSettings.fontSizeValue).toBe(18);
    expect(migratedSettings.fontStyle).toBe("serif");
    expect(storage.has("app_settings")).toBe(false);
  });

  it("normalizes unsupported operational modes to routine on load", async () => {
    jest.doMock("../../services/mmkvStorage", () => ({
      __esModule: true,
      mmkvStorage: {
        getItem: jest.fn(() => null),
        getItemAsync: jest.fn(async () => null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clearAll: jest.fn(),
        flush: jest.fn(async () => undefined),
        initialize: jest.fn(async () => undefined),
      },
    }));

    jest.doMock("../../services/api/authApi", () => ({
      __esModule: true,
      authApi: {
        getUserSettings: jest.fn(async () =>
          buildBackendSettings({ operational_mode: "live_audit" }),
        ),
        updateUserSettings: jest.fn(async () => buildBackendSettings()),
      },
      default: {
        getUserSettings: jest.fn(async () =>
          buildBackendSettings({ operational_mode: "live_audit" }),
        ),
        updateUserSettings: jest.fn(async () => buildBackendSettings()),
      },
    }));

    jest.doMock("../../services/themeService", () => ({
      __esModule: true,
      ThemeService: {
        initialize: jest.fn(async () => undefined),
        getTheme: jest.fn(),
        setTheme: jest.fn(),
        subscribe: jest.fn(() => jest.fn()),
      },
    }));

    jest.doMock("../../services/backupReminderService", () => ({
      __esModule: true,
      syncBackupReminderPreference: jest.fn(async () => undefined),
    }));

    jest.doMock("../../services/logging", () => ({
      __esModule: true,
      createLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      }),
    }));

    let useSettingsStore!: typeof import("../settingsStore").useSettingsStore;
    let setUserPreferenceScope!: typeof import("../../services/userPreferenceScope").setUserPreferenceScope;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ useSettingsStore } = require("../settingsStore"));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ setUserPreferenceScope } = require("../../services/userPreferenceScope"));
    });

    setUserPreferenceScope("ops-user");
    await useSettingsStore.getState().syncFromBackend();

    expect(useSettingsStore.getState().settings.operationalMode).toBe("routine");
  });
});
