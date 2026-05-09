import { afterAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

type LocalStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const createLocalStorageMock = (initial: Record<string, string> = {}): LocalStorageLike => {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
};

describe("feature flags runtime resolution", () => {
  const originalEnv = process.env;
  const originalWindow = (globalThis as any).window;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    (globalThis as any).window = undefined;
  });

  afterAll(() => {
    process.env = originalEnv;
    (globalThis as any).window = originalWindow;
  });

  it("applies precedence as env -> query -> local override", () => {
    process.env.EXPO_PUBLIC_FLAG_enableDeepLinks = "0";

    (globalThis as any).window = {
      location: { search: "?enableDeepLinks=1" },
      localStorage: createLocalStorageMock({
        feature_flag_overrides_v1: JSON.stringify({
          enableDeepLinks: false,
        }),
      }),
    };

    let flagsModule!: typeof import("../flags");
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      flagsModule = require("../flags");
    });

    expect(flagsModule.flags.enableDeepLinks).toBe(false);
  });

  it("allows query override when no local override exists", () => {
    process.env.EXPO_PUBLIC_FLAG_enableDeepLinks = "0";

    (globalThis as any).window = {
      location: { search: "?enableDeepLinks=1" },
      localStorage: createLocalStorageMock(),
    };

    let flagsModule!: typeof import("../flags");
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      flagsModule = require("../flags");
    });

    expect(flagsModule.flags.enableDeepLinks).toBe(true);
  });

  it("keeps public registration disabled by default but allows explicit override", () => {
    let flagsModule!: typeof import("../flags");
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      flagsModule = require("../flags");
    });

    expect(flagsModule.flags.enablePublicRegistration).toBe(false);

    jest.resetModules();
    process.env.EXPO_PUBLIC_FLAG_enablePublicRegistration = "1";

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      flagsModule = require("../flags");
    });

    expect(flagsModule.flags.enablePublicRegistration).toBe(true);
  });

  it("disables all UI epic flags when master kill switch is false", () => {
    (globalThis as any).window = {
      location: { search: "" },
      localStorage: createLocalStorageMock({
        feature_flag_overrides_v1: JSON.stringify({
          uiUpgradeMasterEnabled: false,
          uiVisualSystemV2: true,
        }),
      }),
    };

    let flagsModule!: typeof import("../flags");
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      flagsModule = require("../flags");
    });

    expect(flagsModule.flags.uiUpgradeMasterEnabled).toBe(false);
    expect(flagsModule.flags.uiAuthRedirectV2).toBe(false);
    expect(flagsModule.flags.uiThemeTokensV2).toBe(false);
    expect(flagsModule.flags.uiVisualSystemV2).toBe(false);
    expect(flagsModule.flags.uiSettingsV2).toBe(false);
    expect(flagsModule.flags.uiScanV2).toBe(false);
  });
});
