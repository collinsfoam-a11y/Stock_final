import { Platform } from "react-native";

import {
  MIN_LEGIBLE_FONT_SIZE,
  appleTextStyleFor,
  appleTextStyles,
  enforceMinFontSize,
  maxFontSizeMultiplierFor,
} from "../appleTypography";

describe("appleTypography", () => {
  const originalOS = Platform.OS;

  const setPlatform = (os: typeof Platform.OS) => {
    Object.defineProperty(Platform, "OS", { get: () => os, configurable: true });
  };

  afterEach(() => setPlatform(originalOS));

  it("uses 17pt for body, matching the iOS system text style", () => {
    expect(appleTextStyles.body.fontSize).toBe(17);
    expect(appleTextStyles.headline.fontSize).toBe(17);
  });

  it("maps Material-named variants onto the iOS ramp on iOS", () => {
    setPlatform("ios");
    expect(appleTextStyleFor("body1")).toEqual(appleTextStyles.body);
    expect(appleTextStyleFor("h1")).toEqual(appleTextStyles.largeTitle);
  });

  it("leaves other platforms on their existing scale", () => {
    setPlatform("android");
    expect(appleTextStyleFor("body1")).toBeNull();
    setPlatform("web");
    expect(appleTextStyleFor("body1")).toBeNull();
  });

  it("returns null for unmapped variants", () => {
    setPlatform("ios");
    expect(appleTextStyleFor("mono")).toBeNull();
  });

  it("never renders text below the 11pt legibility floor", () => {
    const raised = enforceMinFontSize({ fontSize: 10, lineHeight: 14 });
    expect(raised?.fontSize).toBe(MIN_LEGIBLE_FONT_SIZE);
    expect(raised?.lineHeight).toBe(15);
  });

  it("leaves styles at or above the floor untouched", () => {
    const style = { fontSize: 13, lineHeight: 18 };
    expect(enforceMinFontSize(style)).toEqual(style);
  });

  it("caps Dynamic Type growth more tightly as layouts get denser", () => {
    expect(maxFontSizeMultiplierFor("flowing")).toBeUndefined();
    expect(maxFontSizeMultiplierFor("standard")).toBeGreaterThan(
      maxFontSizeMultiplierFor("compact") as number,
    );
    expect(maxFontSizeMultiplierFor("compact")).toBeGreaterThan(
      maxFontSizeMultiplierFor("dense") as number,
    );
  });
});
