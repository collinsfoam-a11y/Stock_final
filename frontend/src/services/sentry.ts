import Constants from "expo-constants";
import { Platform } from "react-native";

export interface CaptureContext {
  context?: string;
  message?: string;
  [key: string]: unknown;
}

interface SentryRuntimeConfig {
  dsn: string;
  envelopeUrl: string;
  environment: string;
  release: string;
}

let runtimeConfig: SentryRuntimeConfig | null = null;
let initAttempted = false;

const normalizeRelease = (): string => {
  const appVersion = Constants.expoConfig?.version || "0.0.0";
  const runtimeCandidate = (Constants.expoConfig as Record<string, unknown> | undefined)
    ?.runtimeVersion;
  const runtimeVersion = typeof runtimeCandidate === "string" ? runtimeCandidate : "dev";
  return `stock-final@${appVersion}+${runtimeVersion}`;
};

const buildEnvelopeUrl = (dsn: string): string | null => {
  try {
    const parsed = new URL(dsn);
    const path = parsed.pathname.replace(/\/+$/, "");
    const pathParts = path.split("/").filter(Boolean);
    const projectId = pathParts[pathParts.length - 1];

    if (!projectId) {
      return null;
    }

    const basePath = pathParts.slice(0, -1).join("/");
    const prefix = basePath ? `/${basePath}` : "";
    return `${parsed.protocol}//${parsed.host}${prefix}/api/${projectId}/envelope/`;
  } catch {
    return null;
  }
};

const generateEventId = (): string =>
  Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

const parseStackFrames = (stack?: string): Record<string, unknown>[] => {
  if (!stack) return [];
  const lines = stack
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.slice(1).map((line) => ({ function: line }));
};

export const initSentry = (): void => {
  if (initAttempted) return;
  initAttempted = true;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) {
    return;
  }

  const envelopeUrl = buildEnvelopeUrl(dsn);
  if (!envelopeUrl) {
    console.warn("Sentry disabled: invalid EXPO_PUBLIC_SENTRY_DSN format");
    return;
  }

  runtimeConfig = {
    dsn,
    envelopeUrl,
    environment: process.env.EXPO_PUBLIC_APP_ENV || process.env.NODE_ENV || "development",
    release: normalizeRelease(),
  };
};

const sendSentryEvent = async (error: Error, context?: CaptureContext): Promise<void> => {
  if (!runtimeConfig) {
    return;
  }

  const eventId = generateEventId();
  const timestamp = new Date().toISOString();
  const stackFrames = parseStackFrames(error.stack);

  const envelopeHeader = JSON.stringify({
    event_id: eventId,
    sent_at: timestamp,
    dsn: runtimeConfig.dsn,
    sdk: { name: "stock-final-frontend", version: "1.0.0" },
  });

  const itemHeader = JSON.stringify({ type: "event" });
  const eventPayload = JSON.stringify({
    event_id: eventId,
    timestamp,
    platform: "javascript",
    level: "error",
    environment: runtimeConfig.environment,
    release: runtimeConfig.release,
    logger: "frontend",
    tags: {
      platform: Platform.OS,
    },
    exception: {
      values: [
        {
          type: error.name || "Error",
          value: error.message || "Unknown error",
          stacktrace: stackFrames.length > 0 ? { frames: stackFrames } : undefined,
        },
      ],
    },
    extra: context || {},
  });

  const body = `${envelopeHeader}\n${itemHeader}\n${eventPayload}`;

  await fetch(runtimeConfig.envelopeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-sentry-envelope",
    },
    body,
  });
};

export const captureException = (error: Error, context?: CaptureContext): void => {
  if (!initAttempted) {
    initSentry();
  }

  void sendSentryEvent(error, context).catch((sendError) => {
    if (__DEV__) {
      console.warn("Sentry send failed", sendError);
    }
  });
};
