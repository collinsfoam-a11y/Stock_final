import { describe, expect, it } from "@jest/globals";

import { isRouteAllowedForRole } from "../roleNavigation";

describe("roleNavigation", () => {
  it("only allows admins into admin routes", () => {
    expect(isRouteAllowedForRole("/admin/dashboard-web", "admin")).toBe(true);
    expect(isRouteAllowedForRole("/admin/dashboard-web", "supervisor")).toBe(
      false,
    );
    expect(isRouteAllowedForRole("/admin/dashboard-web", "staff")).toBe(false);
  });

  it("allows supervisors and admins into supervisor routes", () => {
    expect(isRouteAllowedForRole("/supervisor/dashboard", "admin")).toBe(true);
    expect(isRouteAllowedForRole("/supervisor/dashboard", "supervisor")).toBe(
      true,
    );
    expect(isRouteAllowedForRole("/supervisor/dashboard", "staff")).toBe(false);
  });

  it("keeps staff routes limited to staff users", () => {
    expect(isRouteAllowedForRole("/staff/home", "staff")).toBe(true);
    expect(isRouteAllowedForRole("/staff/home", "supervisor")).toBe(false);
    expect(isRouteAllowedForRole("/staff/home", "admin")).toBe(false);
  });
});
