import { __getCameraUnavailableReasonForTests } from "../visionCamera.web";

// jest-expo runs this suite in the node environment, which does not define
// `window`/`navigator`. jsdom is unusable here (its transitive http-proxy-agent
// dependency breaks under require()), so stub the globals the module probes.
if (typeof (globalThis as { window?: unknown }).window === "undefined") {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
    writable: true,
  });
}
if (typeof (globalThis as { navigator?: unknown }).navigator === "undefined") {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {},
    writable: true,
  });
}

const defineWindowSecureContext = (value: boolean) => {
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value,
  });
};

const defineMediaDevices = (mediaDevices: unknown) => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: mediaDevices,
  });
};

describe("visionCamera web capability detection", () => {
  afterEach(() => {
    defineWindowSecureContext(true);
    defineMediaDevices({
      getUserMedia: jest.fn(),
    });
  });

  it("shows the HTTPS guidance first when insecure mobile browsers hide mediaDevices", () => {
    defineWindowSecureContext(false);
    defineMediaDevices(undefined);

    expect(__getCameraUnavailableReasonForTests()).toBe(
      "Camera needs HTTPS in this mobile browser. HTTP LAN cannot show the camera permission prompt. Use Expo Go/native or open the app through HTTPS.",
    );
  });
});
