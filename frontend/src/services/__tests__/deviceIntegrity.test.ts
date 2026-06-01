const mockWarn = jest.fn();

jest.mock("../logging", () => ({
  createLogger: () => ({
    warn: (...args: unknown[]) => mockWarn(...args),
  }),
}));

let constantsMock: any = {
  appOwnership: "standalone",
  executionEnvironment: "standalone",
  isDevice: true,
  nativeAppVersion: "2.1.0",
  nativeBuildVersion: "210",
};

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: constantsMock,
}));

let platformMock: any = { OS: "android" };

jest.mock("react-native", () => ({
  Platform: platformMock,
}));

// eslint-disable-next-line import/first
import { __resetDeviceIntegrityForTests, getDeviceIntegrityHeaderValue } from "../deviceIntegrity";

const parseHeader = (header: string) => JSON.parse(header) as any;

describe("getDeviceIntegrityHeaderValue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetDeviceIntegrityForTests();
    (global as any).__DEV__ = false;
    Object.assign(constantsMock, {
      appOwnership: "standalone",
      executionEnvironment: "standalone",
      isDevice: true,
      nativeAppVersion: "2.1.0",
      nativeBuildVersion: "210",
    });
    platformMock.OS = "android";
  });

  it("returns a cached JSON header string", async () => {
    const first = await getDeviceIntegrityHeaderValue();
    const second = await getDeviceIntegrityHeaderValue();

    expect(first).toBeTruthy();
    expect(second).toBe(first);

    const payload = parseHeader(first as string);
    expect(payload.status).toBe("TRUSTED");
    expect(Array.isArray(payload.signals)).toBe(true);
  });

  it("marks non-physical devices as UNTRUSTED", async () => {
    constantsMock.isDevice = false;

    const header = await getDeviceIntegrityHeaderValue();
    const payload = parseHeader(header as string);

    expect(payload.status).toBe("UNTRUSTED");
    expect(payload.signals).toContain("NOT_PHYSICAL_DEVICE");
  });

  it("marks web as UNTRUSTED", async () => {
    platformMock.OS = "web";

    const header = await getDeviceIntegrityHeaderValue();
    const payload = parseHeader(header as string);

    expect(payload.status).toBe("UNTRUSTED");
    expect(payload.signals).toContain("WEB_PLATFORM");
  });
});
