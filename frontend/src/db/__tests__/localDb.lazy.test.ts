describe("localDb SQLite loading", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("does not load expo-sqlite when the localDb module is imported", async () => {
    let sqliteLoaded = false;
    jest.doMock("expo-sqlite", () => {
      sqliteLoaded = true;
      return {
        openDatabaseAsync: jest.fn(),
      };
    });
    jest.doMock("@/data/db/controlPlaneDb", () => ({
      ensureControlPlaneSchema: jest.fn(),
    }));

    await import("../localDb");

    expect(sqliteLoaded).toBe(false);
  });
});
