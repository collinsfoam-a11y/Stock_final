import { Platform } from "react-native";

export type FontStylePreference = "system" | "serif" | "mono";

export const FONT_STYLE_OPTIONS: {
  value: FontStylePreference;
  label: string;
  preview: string;
}[] = [
  { value: "system", label: "System", preview: "Aa" },
  { value: "serif", label: "Serif", preview: "Ag" },
  { value: "mono", label: "Mono", preview: "01" },
];

export const normalizeThemePreference = (value: unknown): "light" | "dark" => {
  return value === "dark" ? "dark" : "light";
};

export const normalizeFontSizePreference = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(12, Math.min(22, Math.round(value)));
  }

  switch (value) {
    case "small":
      return 14;
    case "large":
      return 18;
    case "xlarge":
      return 20;
    case "medium":
    default:
      return 16;
  }
};

export const normalizeFontStylePreference = (
  value: unknown,
): FontStylePreference => {
  return value === "serif" || value === "mono" ? value : "system";
};

const systemFamily =
  Platform.select({
    ios: "System",
    android: "sans-serif",
    web: "system-ui",
    default: "System",
  }) ?? "System";

const serifFamily =
  Platform.select({
    ios: "Georgia",
    android: "serif",
    web: "Georgia",
    default: "serif",
  }) ?? "serif";

const monoFamily =
  Platform.select({
    ios: "Menlo",
    android: "monospace",
    web: "ui-monospace",
    default: "monospace",
  }) ?? "monospace";

export const resolveFontFamilies = (
  fontStyle: FontStylePreference,
): {
  display: string;
  heading: string;
  body: string;
  label: string;
  mono: string;
} => {
  switch (fontStyle) {
    case "serif":
      return {
        display: serifFamily,
        heading: serifFamily,
        body: serifFamily,
        label: serifFamily,
        mono: monoFamily,
      };
    case "mono":
      return {
        display: monoFamily,
        heading: monoFamily,
        body: monoFamily,
        label: monoFamily,
        mono: monoFamily,
      };
    case "system":
    default:
      return {
        display: systemFamily,
        heading: systemFamily,
        body: systemFamily,
        label: systemFamily,
        mono: monoFamily,
      };
  }
};
