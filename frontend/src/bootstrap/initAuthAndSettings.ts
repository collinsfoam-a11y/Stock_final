import { withTimeout } from "./withTimeout";
import { useAuthStore } from "../store/authStore";
import { createLogger } from "../services/logging";

const log = createLogger("initAuthAndSettings");

export interface AuthAndSettingsInitResult {
  authResult: PromiseSettledResult<void>;
  settingsResult: PromiseSettledResult<void>;
}

export interface InitAuthAndSettingsOptions {
  deferUnauthenticatedSettings?: boolean;
}

export async function initAuthAndSettings(
  loadStoredAuth: () => Promise<void>,
  loadSettings: () => Promise<void>,
  options: InitAuthAndSettingsOptions = {},
): Promise<AuthAndSettingsInitResult> {
  // Important: load auth first so any user preference scope is set before we
  // read persisted settings. Otherwise settings can be loaded/migrated under the
  // unscoped key and leak across users sharing the same device.
  const authResult = (await Promise.allSettled([
    withTimeout(loadStoredAuth(), 3000, "Auth loading timeout"),
  ]))[0] as PromiseSettledResult<void>;

  const shouldDeferUnauthenticatedSettings =
    options.deferUnauthenticatedSettings &&
    !useAuthStore.getState().isAuthenticated;

  if (shouldDeferUnauthenticatedSettings) {
    void withTimeout(loadSettings(), 3000, "Settings loading timeout").catch(
      (error) => {
        log.warn("Deferred settings loading failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      },
    );

    return {
      authResult,
      settingsResult: {
        status: "fulfilled",
        value: undefined,
      } as PromiseFulfilledResult<void>,
    };
  }

  const settingsResult = useAuthStore.getState().isAuthenticated
    ? ({
        status: "fulfilled",
        value: undefined,
      } as PromiseFulfilledResult<void>)
    : ((await Promise.allSettled([
        withTimeout(loadSettings(), 3000, "Settings loading timeout"),
      ]))[0] as PromiseSettledResult<void>);

  return { authResult, settingsResult };
}
