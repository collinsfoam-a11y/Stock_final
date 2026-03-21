import {
  isAdminRouteEnabled,
  isSupervisorRouteEnabled,
} from "../roleFeatureFlags";

describe("roleFeatureFlags", () => {
  describe("isSupervisorRouteEnabled", () => {
    it("allows core supervisor routes", () => {
      expect(isSupervisorRouteEnabled("dashboard")).toBe(true);
      expect(isSupervisorRouteEnabled("sessions")).toBe(true);
      expect(isSupervisorRouteEnabled("variances")).toBe(true);
      expect(isSupervisorRouteEnabled("user-workflows")).toBe(true);
      expect(isSupervisorRouteEnabled("offline-queue")).toBe(true);
      expect(isSupervisorRouteEnabled("sync-conflicts")).toBe(true);
    });

    it("blocks removed supervisor routes", () => {
      expect(isSupervisorRouteEnabled("db-mapping")).toBe(false);
      expect(isSupervisorRouteEnabled("error-logs")).toBe(false);
      expect(isSupervisorRouteEnabled("export")).toBe(false);
      expect(isSupervisorRouteEnabled("export-results")).toBe(false);
      expect(isSupervisorRouteEnabled("export-schedules")).toBe(false);
      expect(isSupervisorRouteEnabled("notes")).toBe(false);
      expect(isSupervisorRouteEnabled("watchtower")).toBe(false);
    });
  });

  describe("isAdminRouteEnabled", () => {
    it("allows core admin routes", () => {
      expect(isAdminRouteEnabled("dashboard-web")).toBe(true);
      expect(isAdminRouteEnabled("users")).toBe(true);
      expect(isAdminRouteEnabled("security")).toBe(true);
      expect(isAdminRouteEnabled("sql-config")).toBe(true);
    });

    it("blocks removed admin routes", () => {
      expect(isAdminRouteEnabled("ai-assistant")).toBe(false);
    });
  });
});
