describe("filterStore persistence scoping", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("rehydrates only the active user's presets and ignores legacy shared storage", async () => {
    let AsyncStorage: typeof import("@react-native-async-storage/async-storage").default | null =
      null;
    let useFilterStore: ReturnType<typeof require>["useFilterStore"] | null = null;
    let rehydrateFilterStore:
      | ReturnType<typeof require>["rehydrateFilterStore"]
      | null = null;
    let setUserPreferenceScope:
      | ReturnType<typeof require>["setUserPreferenceScope"]
      | null = null;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const asyncStorageModule = require("@react-native-async-storage/async-storage");
      AsyncStorage = asyncStorageModule.default ?? asyncStorageModule;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ setUserPreferenceScope } = require("../../services/userPreferenceScope"));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ({ useFilterStore, rehydrateFilterStore } = require("../filterStore"));
    });

    expect(AsyncStorage).not.toBeNull();
    expect(useFilterStore).not.toBeNull();
    expect(rehydrateFilterStore).not.toBeNull();
    expect(setUserPreferenceScope).not.toBeNull();

    await AsyncStorage!.clear();
    await AsyncStorage!.setItem(
      "filter-store:user-a",
      JSON.stringify({
        state: {
          presets: [
            {
              id: "preset-a",
              name: "User A preset",
              filters: { status: ["variance"] },
              createdAt: "2026-03-15T00:00:00.000Z",
            },
          ],
        },
        version: 0,
      }),
    );
    await AsyncStorage!.setItem(
      "filter-store",
      JSON.stringify({
        state: {
          presets: [
            {
              id: "legacy",
              name: "Legacy shared preset",
              filters: { type: ["unsafe"] },
              createdAt: "2026-03-01T00:00:00.000Z",
            },
          ],
        },
        version: 0,
      }),
    );

    setUserPreferenceScope!("user-b");
    await rehydrateFilterStore!();
    expect(useFilterStore!.getState().presets).toEqual([]);

    setUserPreferenceScope!("user-a");
    await rehydrateFilterStore!();
    expect(useFilterStore!.getState().presets).toEqual([
      expect.objectContaining({
        id: "preset-a",
        name: "User A preset",
      }),
    ]);

    expect(await AsyncStorage!.getItem("filter-store")).toBeNull();
  });
});
