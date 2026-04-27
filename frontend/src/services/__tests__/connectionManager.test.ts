import { shouldMonitorConnectionHealth } from "../connectionMonitoring";

describe("shouldMonitorConnectionHealth", () => {
  it("skips health polling for same-origin web connections", () => {
    expect(
      shouldMonitorConnectionHealth(
        { backendUrl: "http://localhost:8081/" },
        "web",
        "http://localhost:8081",
      ),
    ).toBe(false);
  });

  it("keeps health polling for non same-origin web backends", () => {
    expect(
      shouldMonitorConnectionHealth(
        { backendUrl: "http://127.0.0.1:8001" },
        "web",
        "http://localhost:8081",
      ),
    ).toBe(true);
  });

  it("keeps health polling outside web", () => {
    expect(
      shouldMonitorConnectionHealth(
        { backendUrl: "http://10.0.2.2:8001" },
        "android",
        null,
      ),
    ).toBe(true);
  });
});
