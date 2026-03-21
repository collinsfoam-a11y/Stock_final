import {
  getConfiguredAppUpdateUrl,
  resolveAppUpdateUrl,
} from "@/services/updateService";

describe("updateService", () => {
  const previousUpdateUrl = process.env.EXPO_PUBLIC_APP_UPDATE_URL;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_APP_UPDATE_URL = "";
  });

  afterAll(() => {
    process.env.EXPO_PUBLIC_APP_UPDATE_URL = previousUpdateUrl;
  });

  it("returns null when no configured update URL exists", () => {
    expect(getConfiguredAppUpdateUrl()).toBeNull();
  });

  it("returns trimmed configured update URL from env", () => {
    process.env.EXPO_PUBLIC_APP_UPDATE_URL =
      "  https://downloads.example.com/latest.apk  ";

    expect(getConfiguredAppUpdateUrl()).toBe(
      "https://downloads.example.com/latest.apk",
    );
  });

  it("prefers backend release notes URL when provided", () => {
    process.env.EXPO_PUBLIC_APP_UPDATE_URL =
      "https://downloads.example.com/latest.apk";

    expect(
      resolveAppUpdateUrl({
        release_notes_url: "https://backend.example.com/release-notes",
      }),
    ).toBe("https://backend.example.com/release-notes");
  });

  it("falls back to configured URL when backend URL is missing", () => {
    process.env.EXPO_PUBLIC_APP_UPDATE_URL =
      "https://downloads.example.com/latest.apk";

    expect(
      resolveAppUpdateUrl({
        release_notes_url: null,
      }),
    ).toBe("https://downloads.example.com/latest.apk");
  });
});
