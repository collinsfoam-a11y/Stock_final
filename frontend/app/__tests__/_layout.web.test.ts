import { resolveWebRouteMode } from "../_layout.web";

describe("resolveWebRouteMode", () => {
  it("keeps login on the themed public shell when pathname resolves before segments", () => {
    expect(resolveWebRouteMode([], "/login")).toBe("themed-public");
  });

  it("treats the root route as bare public", () => {
    expect(resolveWebRouteMode([], "/")).toBe("bare-public");
  });

  it("treats welcome as bare public", () => {
    expect(resolveWebRouteMode([], "/welcome")).toBe("bare-public");
  });

  it("treats protected routes as protected", () => {
    expect(resolveWebRouteMode([], "/supervisor/dashboard")).toBe("protected");
  });

  it("keeps unresolved routes pending until a pathname is available", () => {
    expect(resolveWebRouteMode([], undefined)).toBe("pending");
  });
});
