import { shouldPollNotifications } from "../notificationPolling";

describe("shouldPollNotifications", () => {
  it("does not poll when the app is not active", () => {
    expect(shouldPollNotifications("background", "web", "visible")).toBe(false);
  });

  it("does not poll hidden web tabs", () => {
    expect(shouldPollNotifications("active", "web", "hidden")).toBe(false);
  });

  it("allows polling when the app is active and visible", () => {
    expect(shouldPollNotifications("active", "web", "visible")).toBe(true);
  });

  it("allows polling on native when the app is active", () => {
    expect(shouldPollNotifications("active", "android", "hidden")).toBe(true);
  });
});
