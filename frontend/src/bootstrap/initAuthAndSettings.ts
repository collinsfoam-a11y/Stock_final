import { withTimeout } from "./withTimeout";

export interface AuthAndSettingsInitResult {
  authResult: PromiseSettledResult<void>;
  settingsResult: PromiseSettledResult<void>;
}

export async function initAuthAndSettings(
  loadStoredAuth: () => Promise<void>,
  loadSettings: () => Promise<void>,
): Promise<AuthAndSettingsInitResult> {
  // Important: load auth first so any user preference scope is set before we
  // read persisted settings. Otherwise settings can be loaded/migrated under the
  // unscoped key and leak across users sharing the same device.
  const authResult = (await Promise.allSettled([
    withTimeout(loadStoredAuth(), 3000, "Auth loading timeout"),
  ]))[0] as PromiseSettledResult<void>;

  const settingsResult = (await Promise.allSettled([
    withTimeout(loadSettings(), 3000, "Settings loading timeout"),
  ]))[0] as PromiseSettledResult<void>;

  return { authResult, settingsResult };
}
