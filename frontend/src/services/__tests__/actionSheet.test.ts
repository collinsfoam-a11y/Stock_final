import { ActionSheetIOS, Alert, Platform } from "react-native";

import { confirmAction, showActionSheet } from "../actionSheet";

describe("actionSheet", () => {
  const originalOS = Platform.OS;

  const setPlatform = (os: typeof Platform.OS) => {
    Object.defineProperty(Platform, "OS", { get: () => os, configurable: true });
  };

  afterEach(() => {
    setPlatform(originalOS);
    jest.restoreAllMocks();
  });

  describe("confirmAction on iOS", () => {
    beforeEach(() => setPlatform("ios"));

    it("presents an action sheet and resolves true when the action is chosen", async () => {
      const spy = jest
        .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
        .mockImplementation((_options, callback) => callback(1));

      await expect(
        confirmAction({ title: "Sign Out", confirmLabel: "Sign Out", destructive: true }),
      ).resolves.toBe(true);

      const options = spy.mock.calls[0]![0];
      expect(options.options).toEqual(["Cancel", "Sign Out"]);
      expect(options.cancelButtonIndex).toBe(0);
      expect(options.destructiveButtonIndex).toBe(1);
    });

    it("resolves false when cancelled", async () => {
      jest
        .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
        .mockImplementation((_options, callback) => callback(0));

      await expect(
        confirmAction({ title: "Sign Out", confirmLabel: "Sign Out" }),
      ).resolves.toBe(false);
    });

    it("omits the destructive index for non-destructive actions", async () => {
      const spy = jest
        .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
        .mockImplementation((_options, callback) => callback(0));

      await confirmAction({ title: "Export", confirmLabel: "Export" });

      expect(spy.mock.calls[0]![0].destructiveButtonIndex).toBeUndefined();
    });
  });

  describe("confirmAction on Android", () => {
    beforeEach(() => setPlatform("android"));

    it("falls back to an alert and resolves from the pressed button", async () => {
      jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
        buttons?.[1]?.onPress?.();
      });

      await expect(
        confirmAction({ title: "Reset", confirmLabel: "Reset", destructive: true }),
      ).resolves.toBe(true);
    });
  });

  describe("showActionSheet", () => {
    beforeEach(() => setPlatform("ios"));

    it("skips disabled choices and calls the selected handler", () => {
      const onPress = jest.fn();
      const spy = jest
        .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
        .mockImplementation((_options, callback) => callback(1));

      showActionSheet({
        title: "Session",
        choices: [
          { label: "Hidden", onPress: jest.fn(), disabled: true },
          { label: "Delete", onPress, destructive: true },
        ],
      });

      const options = spy.mock.calls[0]![0];
      expect(options.options).toEqual(["Cancel", "Delete"]);
      expect(options.destructiveButtonIndex).toBe(1);
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it("does nothing when every choice is disabled", () => {
      const spy = jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions");

      showActionSheet({ choices: [{ label: "Only", onPress: jest.fn(), disabled: true }] });

      expect(spy).not.toHaveBeenCalled();
    });
  });
});
