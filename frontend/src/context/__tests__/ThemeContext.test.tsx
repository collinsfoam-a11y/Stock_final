import { renderHook } from "@testing-library/react-native";

import { useThemeContext } from "../ThemeContext";

describe("useThemeContext fallback", () => {
  it("returns a complete legacy typography contract outside ThemeProvider", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const { result } = renderHook(() => useThemeContext());

    expect(result.current.themeLegacy.typography.fontWeight.bold).toBe("700");
    expect(result.current.themeLegacy.typography.fontWeight.semibold).toBe("600");
    expect(result.current.themeLegacy.typography.fontFamily.body).toBeTruthy();
    expect(result.current.themeLegacy.typography.fontSize["3xl"]).toBeGreaterThan(
      result.current.themeLegacy.typography.fontSize.xl,
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "useThemeContext called outside ThemeProvider - returning default theme",
    );

    warnSpy.mockRestore();
  });
});
