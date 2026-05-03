import { getConnectivityState } from "@/core/connectivityState";
import { useAuthStore } from "@/store/authStore";
import { useScanSessionStore } from "@/store/scanSessionStore";

import { captureException } from "./sentry";

let isRegistered = false;

const buildRuntimeContext = (source: string): Record<string, unknown> => {
  const user = useAuthStore.getState().user;
  const sessionState = useScanSessionStore.getState();

  return {
    source,
    user: user?.username || null,
    role: user?.role || null,
    session_id: sessionState.activeSessionId || null,
    connectivity_state: getConnectivityState(),
  };
};

const toError = (value: unknown): Error => {
  if (value instanceof Error) {
    return value;
  }
  return new Error(String(value));
};

export const registerGlobalErrorTrackingHooks = (): void => {
  if (isRegistered) {
    return;
  }
  isRegistered = true;

  if (typeof window !== "undefined") {
    window.addEventListener("error", (event) => {
      captureException(toError(event.error || event.message), {
        ...buildRuntimeContext("window.error"),
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      captureException(toError(event.reason), {
        ...buildRuntimeContext("window.unhandledrejection"),
      });
    });
  }

  const maybeErrorUtils = (globalThis as any).ErrorUtils;
  if (
    maybeErrorUtils &&
    typeof maybeErrorUtils.getGlobalHandler === "function" &&
    typeof maybeErrorUtils.setGlobalHandler === "function"
  ) {
    const previousHandler = maybeErrorUtils.getGlobalHandler();
    maybeErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      captureException(toError(error), {
        ...buildRuntimeContext("native.global"),
        is_fatal: Boolean(isFatal),
      });

      if (typeof previousHandler === "function") {
        previousHandler(error, isFatal);
      }
    });
  }
};
