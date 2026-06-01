import Constants from "expo-constants";
import { Platform } from "react-native";
import { createLogger } from "./logging";

export type DeviceIntegrityStatus = "TRUSTED" | "UNTRUSTED" | "UNKNOWN";

export type DeviceIntegrityPayload = {
  status: DeviceIntegrityStatus;
  signals: string[];
  checked_at: string;
  platform: string;
  app_ownership?: string | null;
  execution_environment?: string | null;
  is_device?: boolean | null;
  native_app_version?: string | null;
  native_build_version?: string | null;
};

const log = createLogger("deviceIntegrity");
let cachedHeaderValue: string | null = null;

const nowIso = (): string => new Date().toISOString();

const isDevBuild = (): boolean =>
  typeof __DEV__ !== "undefined" ? Boolean(__DEV__) : process.env.NODE_ENV === "development";

const computeIntegrityPayload = (): DeviceIntegrityPayload => {
  const signals: string[] = [];

  const appOwnership = Constants.appOwnership ?? null;
  const executionEnvironment = (Constants.executionEnvironment as string | undefined) ?? null;
  const isDevice =
    typeof Constants.isDevice === "boolean" ? (Constants.isDevice as boolean) : null;

  if (isDevBuild()) {
    signals.push("DEV_BUILD");
  }

  if (appOwnership && appOwnership !== "standalone") {
    signals.push("NON_STANDALONE");
  }

  if (isDevice === false) {
    signals.push("NOT_PHYSICAL_DEVICE");
  }

  if (Platform.OS === "web") {
    signals.push("WEB_PLATFORM");
  }

  let status: DeviceIntegrityStatus = "UNKNOWN";
  if (signals.length > 0) {
    status = "UNTRUSTED";
  } else if (appOwnership === "standalone" && isDevice !== false && Platform.OS !== "web") {
    status = "TRUSTED";
  }

  return {
    status,
    signals,
    checked_at: nowIso(),
    platform: Platform.OS,
    app_ownership: appOwnership,
    execution_environment: executionEnvironment,
    is_device: isDevice,
    native_app_version: Constants.nativeAppVersion ?? null,
    native_build_version: Constants.nativeBuildVersion ?? null,
  };
};

export const getDeviceIntegrityHeaderValue = async (): Promise<string | null> => {
  if (cachedHeaderValue) {
    return cachedHeaderValue;
  }

  try {
    const payload = computeIntegrityPayload();
    cachedHeaderValue = JSON.stringify(payload);
    return cachedHeaderValue;
  } catch (err) {
    log.warn("Failed to compute device integrity header", { error: String(err) });
    return null;
  }
};

export const __resetDeviceIntegrityForTests = (): void => {
  cachedHeaderValue = null;
};

