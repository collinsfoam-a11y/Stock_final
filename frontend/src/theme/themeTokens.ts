import { Platform } from "react-native";
import type { ViewStyle } from "react-native";
import type { AppTheme } from "./themes";

export type ThemeTokens = {
  mode: "light" | "dark";
  colors: {
    background: string;
    surface: string;
    surfaceElevated: string;
    border: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    accent: string;
    accentStrong: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    overlay: string;
  };
  spacing: {
    none: number;
    xxs: number;
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    "2xl": number;
    "3xl": number;
    xxl: number;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    full: number;
  };
  shadows: {
    none: ViewStyle;
    sm: ViewStyle;
    md: ViewStyle;
    lg: ViewStyle;
    xl: ViewStyle;
  };
  motion: {
    enabled: boolean;
    fast: number;
    normal: number;
    slow: number;
  };
  gradients: {
    primary: readonly string[];
    surface: readonly string[];
    accent: readonly string[];
  };
};

const ensureDuration = (value: number | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const safeReadonly = (value: readonly string[] | undefined, fallback: readonly string[]) =>
  value && value.length > 0 ? value : fallback;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const stringAt = (source: unknown, key: string): string | undefined =>
  isRecord(source) && typeof source[key] === "string" ? (source[key] as string) : undefined;

const nestedColor = (source: unknown, keys: string[]): string | undefined => {
  if (!isRecord(source)) return undefined;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string") return value;
  }

  return undefined;
};

const scalarColor = (source: unknown): string | undefined =>
  typeof source === "string" ? source : undefined;

const branchColor = (source: unknown, keys: string[], fallback: string): string =>
  nestedColor(source, keys) ?? scalarColor(source) ?? fallback;

export const colorWithAlpha = (color: string, alpha: number): string => {
  const normalizedAlpha = Math.max(0, Math.min(1, alpha));
  const hex = color.trim().replace("#", "");

  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const expanded = hex
      .split("")
      .map((char) => char + char)
      .join("");
    const r = parseInt(expanded.slice(0, 2), 16);
    const g = parseInt(expanded.slice(2, 4), 16);
    const b = parseInt(expanded.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
  }

  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
  }

  const rgbMatch = color.match(/rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i);
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${normalizedAlpha})`;
  }

  return color;
};

export const createThemeTokens = (
  theme: AppTheme,
  mode: "light" | "dark",
  motionEnabled: boolean
): ThemeTokens => {
  const themeAny = theme as AppTheme & {
    radius?: Record<string, number>;
    spacing?: Record<string, number>;
  };
  const colors = theme.colors as unknown as Record<string, unknown>;
  const backgroundColors = colors.background;
  const textColors = colors.text;
  const borderColors = colors.border;
  const primaryColors = colors.primary;
  const secondaryColors = colors.secondary;
  const radiusSource = (theme.borderRadius ?? themeAny.radius ?? {}) as Record<string, number>;
  const spacingSource = themeAny.spacing ?? {};
  const shadowsSource = theme.shadows ?? {};

  const background = branchColor(backgroundColors, ["default"], "#FFFFFF");
  const surface =
    nestedColor(backgroundColors, ["paper"]) ??
    stringAt(colors, "surface") ??
    scalarColor(backgroundColors) ??
    background;
  const surfaceElevated =
    nestedColor(backgroundColors, ["elevated"]) ?? stringAt(colors, "surfaceElevated") ?? surface;
  const accent =
    stringAt(colors, "accent") ?? nestedColor(primaryColors, ["500", "main"]) ?? "#2563EB";
  const accentStrong =
    stringAt(colors, "accentDark") ??
    nestedColor(primaryColors, ["700", "600", "dark"]) ??
    nestedColor(secondaryColors, ["700", "600", "dark"]) ??
    accent;
  const errorBranch = colors.error ?? colors.danger;

  return {
    mode,
    colors: {
      background,
      surface,
      surfaceElevated,
      border:
        nestedColor(borderColors, ["light"]) ??
        stringAt(colors, "borderLight") ??
        stringAt(colors, "border") ??
        "#D1D5DB",
      textPrimary:
        nestedColor(textColors, ["primary"]) ??
        stringAt(colors, "textPrimary") ??
        scalarColor(textColors) ??
        "#111827",
      textSecondary:
        nestedColor(textColors, ["secondary"]) ??
        stringAt(colors, "textSecondary") ??
        stringAt(colors, "muted") ??
        "#4B5563",
      textMuted:
        nestedColor(textColors, ["muted", "tertiary"]) ??
        stringAt(colors, "textTertiary") ??
        stringAt(colors, "textMuted") ??
        stringAt(colors, "muted") ??
        "#6B7280",
      accent,
      accentStrong,
      success: branchColor(colors.success, ["main"], "#16A34A"),
      warning: branchColor(colors.warning, ["main"], "#D97706"),
      error: branchColor(errorBranch, ["main"], "#DC2626"),
      info: branchColor(colors.info, ["main"], accent),
      overlay:
        nestedColor(backgroundColors, ["overlay"]) ??
        stringAt(colors, "overlay") ??
        stringAt(colors, "glass") ??
        "rgba(0, 0, 0, 0.5)",
    },
    spacing: {
      none: 0,
      xxs: spacingSource.xxs ?? 2,
      xs: spacingSource.xs ?? 4,
      sm: spacingSource.sm ?? 8,
      md: spacingSource.md ?? spacingSource.base ?? 16,
      lg: spacingSource.lg ?? 24,
      xl: spacingSource.xl ?? 32,
      "2xl": spacingSource["2xl"] ?? spacingSource.xxl ?? 24,
      "3xl": spacingSource["3xl"] ?? 32,
      xxl: spacingSource["2xl"] ?? spacingSource.xxl ?? 48,
    },
    radius: {
      sm: radiusSource.sm ?? 4,
      md: radiusSource.md ?? 8,
      lg: radiusSource.lg ?? 12,
      xl: radiusSource.xl ?? 16,
      full: radiusSource.full ?? radiusSource.round ?? 999,
    },
    shadows: {
      none: {},
      sm: shadowsSource.sm ?? {},
      md: shadowsSource.md ?? {},
      lg: shadowsSource.lg ?? {},
      xl: shadowsSource.xl ?? {},
    },
    motion: {
      enabled: motionEnabled,
      fast: ensureDuration(theme.animations?.duration?.fast, 150),
      normal: ensureDuration(theme.animations?.duration?.normal, 250),
      slow: ensureDuration(theme.animations?.duration?.slow, 350),
    },
    gradients: {
      primary: safeReadonly(theme.gradients?.primary, [accent, accentStrong]),
      surface: safeReadonly(theme.gradients?.surface, [surface, background]),
      accent: safeReadonly(theme.gradients?.accent, [accent, accentStrong]),
    },
  };
};

export const getTokenShadowStyle = (
  tokens: ThemeTokens,
  level: keyof ThemeTokens["shadows"]
): ViewStyle => {
  const base = (tokens.shadows[level] || {}) as ViewStyle & {
    boxShadow?: string;
  };

  if (Platform.OS === "web") {
    if (typeof base.boxShadow === "string") {
      return base;
    }

    const offset = base.shadowOffset;
    const shadowRadius = typeof base.shadowRadius === "number" ? base.shadowRadius : 0;
    const shadowOpacity =
      typeof base.shadowOpacity === "number" ? Math.max(0, Math.min(1, base.shadowOpacity)) : 0;
    const shadowColor = typeof base.shadowColor === "string" ? base.shadowColor : "#000000";

    const width = offset && typeof offset.width === "number" ? offset.width : 0;
    const height = offset && typeof offset.height === "number" ? offset.height : 0;

    if (shadowRadius > 0 || shadowOpacity > 0) {

      const result = { ...base };
      delete result.shadowColor;
      delete result.shadowOffset;
      delete result.shadowOpacity;
      delete result.shadowRadius;
      return {
        ...result,
        boxShadow: `${width}px ${height}px ${shadowRadius}px ${colorWithAlpha(
          shadowColor,
          shadowOpacity
        )}`,

      };
    }
  }

  return base;
};
