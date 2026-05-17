import { createLogger } from "../services/logging";

const log = createLogger("flags");
const LOCAL_OVERRIDE_KEY = "feature_flag_overrides_v1";

export type FeatureFlags = {
  enableDeepLinks: boolean;
  enableHaptics: boolean;
  enableAnimations: boolean;
  enableSwipeActions: boolean;
  enableDebugMode: boolean;
  enableNetworkLogging: boolean;
  enableOfflineQueue: boolean;
  enableNotes: boolean;
  enablePublicRegistration: boolean;
  uiUpgradeMasterEnabled: boolean;
  uiAuthRedirectV2: boolean;
  uiThemeTokensV2: boolean;
  uiVisualSystemV2: boolean;
  uiSettingsV2: boolean;
  uiScanV2: boolean;
};

export type FeatureFlagName = keyof FeatureFlags;

const DEFAULT_FLAGS: FeatureFlags = {
  enableDeepLinks: true,
  enableHaptics: true,
  enableAnimations: true,
  enableSwipeActions: true,
  enableDebugMode: __DEV__,
  enableNetworkLogging: __DEV__,
  enableOfflineQueue: true,
  enableNotes: true,
  enablePublicRegistration: false,
  uiUpgradeMasterEnabled: true,
  uiAuthRedirectV2: true,
  uiThemeTokensV2: true,
  uiVisualSystemV2: true,
  uiSettingsV2: true,
  uiScanV2: true,
};

const UI_EPIC_FLAGS: FeatureFlagName[] = [
  "uiAuthRedirectV2",
  "uiThemeTokensV2",
  "uiVisualSystemV2",
  "uiSettingsV2",
  "uiScanV2",
];

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

const parseFlagValue = (raw: string | undefined): boolean | null => {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return null;
};

const readEnvOverride = (flagName: FeatureFlagName): boolean | null => {
  const envKey = `EXPO_PUBLIC_FLAG_${flagName}`;
  return parseFlagValue(process.env[envKey]);
};

const readQueryOverride = (flagName: FeatureFlagName): boolean | null => {
  if (typeof window === "undefined") return null;
  const search = window.location?.search;
  if (!search) return null;
  const params = new URLSearchParams(search);
  return (
    parseFlagValue(params.get(`flag.${flagName}`) ?? undefined) ??
    parseFlagValue(params.get(flagName) ?? undefined)
  );
};

const readLocalOverrides = (): Partial<FeatureFlags> => {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_OVERRIDE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const overrides: Partial<FeatureFlags> = {};

    for (const key of Object.keys(DEFAULT_FLAGS) as FeatureFlagName[]) {
      const value = parsed[key];
      if (typeof value === "boolean") {
        overrides[key] = value;
      }
    }
    return overrides;
  } catch (error) {
    log.warn("Failed to parse local feature flag overrides", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
};

const writeLocalOverrides = (overrides: Partial<FeatureFlags>) => {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(LOCAL_OVERRIDE_KEY, JSON.stringify(overrides));
  } catch (error) {
    log.warn("Failed to persist local feature flag overrides", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const resolveFlags = (): FeatureFlags => {
  const resolved: FeatureFlags = { ...DEFAULT_FLAGS };

  // 1) Build defaults (already copied above)
  // 2) Environment overrides
  for (const key of Object.keys(resolved) as FeatureFlagName[]) {
    const envValue = readEnvOverride(key);
    if (envValue !== null) {
      resolved[key] = envValue;
    }
  }

  // 3) URL query overrides (web)
  for (const key of Object.keys(resolved) as FeatureFlagName[]) {
    const queryValue = readQueryOverride(key);
    if (queryValue !== null) {
      resolved[key] = queryValue;
    }
  }

  // 4) Local persisted overrides (web)
  const localOverrides = readLocalOverrides();
  for (const key of Object.keys(localOverrides) as FeatureFlagName[]) {
    const value = localOverrides[key];
    if (typeof value === "boolean") {
      resolved[key] = value;
    }
  }

  // Emergency kill switch for UI epic.
  if (!resolved.uiUpgradeMasterEnabled) {
    for (const key of UI_EPIC_FLAGS) {
      resolved[key] = false;
    }
  }

  return resolved;
};

const applyResolvedFlags = (next: FeatureFlags) => {
  for (const key of Object.keys(next) as FeatureFlagName[]) {
    flags[key] = next[key];
  }
};

export const flags: FeatureFlags = resolveFlags();

export const getFlag = (flagName: FeatureFlagName): boolean => flags[flagName];

export const setFlagOverride = (flagName: FeatureFlagName, value: boolean | null) => {
  const localOverrides = readLocalOverrides();
  if (value === null) {
    delete localOverrides[flagName];
  } else {
    localOverrides[flagName] = value;
  }
  writeLocalOverrides(localOverrides);
  applyResolvedFlags(resolveFlags());
};

export const clearFlagOverrides = () => {
  writeLocalOverrides({});
  applyResolvedFlags(resolveFlags());
};

if (__DEV__) {
  log.info("Resolved feature flags", flags);
}
