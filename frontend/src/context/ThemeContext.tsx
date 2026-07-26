/**
 * Theme Context - Global Theme Management
 *
 * Provides:
 * - Light/dark theme switching
 * - Dynamic font size
 * - Dynamic font style
 */

import * as React from "react";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useColorScheme } from "react-native";
import { themes, AppTheme } from "../theme/themes";
import { useSettingsStore } from "../store/settingsStore";
import { useAuthStore } from "../store/authStore";
import {
  normalizeThemePreference,
  resolveFontFamilies,
} from "../theme/fontPreferences";

const hexToRgba = (hex: string, alpha: number): string => {
  const normalized = hex.replace("#", "").trim();
  const isValid = /^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized);
  if (!isValid) return hex;

  const expanded =
    normalized.length === 3
      ? normalized
        .split("")
        .map((c) => c + c)
        .join("")
      : normalized;

  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
};

// Available theme keys
export type ThemeKey =
  | "light"
  | "dark"
  | "premium"
  | "ocean"
  | "sunset"
  | "highContrast";
export type ThemeMode = "light" | "dark" | "system";

// Pattern types for background arrangements
export type PatternType =
  | "none"
  | "dots"
  | "grid"
  | "waves"
  | "aurora"
  | "mesh"
  | "circuit"
  | "hexagon";

// Layout arrangement types
export type LayoutArrangement =
  | "default"
  | "compact"
  | "spacious"
  | "cards"
  | "list"
  | "grid";

interface ThemeContextType {
  // Current theme
  theme: AppTheme;
  // Legacy/normalized theme contract (flat string colors) for most components
  themeLegacy: {
    theme: "light" | "dark";
    isDark: boolean;
    colors: {
      primary: string;
      secondary: string;
      muted: string;
      background: string;
      surface: string;
      surfaceElevated: string;
      surfaceDark: string;
      text: string;
      textTokens: Record<string, string>;
      textPrimary: string;
      textSecondary: string;
      textTertiary: string;
      border: string;
      borderLight: string;
      error: string;
      success: string;
      warning: string;
      info: string;
      danger: string;
      overlay: string;
      overlayPrimary: string;
      accent: string;
      accentLight: string;
      accentDark: string;
      glass: string;
      card: string;
      placeholder: string;
      disabled: string;
    };
    gradients: Record<string, any>;
    spacing: {
      xs: number;
      sm: number;
      md: number;
      base: number;
      lg: number;
      xl: number;
      xxl: number;
    };
    typography: any;
    borderRadius: {
      sm: number;
      md: number;
      lg: number;
      xl: number;
      round: number;
    };
    shadows: Record<string, any>;
    animations: Record<string, any>;
    componentSizes: Record<string, any>;
    layout: Record<string, any>;
  };
  themeKey: ThemeKey;
  themeMode: ThemeMode;
  isDark: boolean;

  // Pattern & Layout
  pattern: PatternType;
  layout: LayoutArrangement;

  // Dynamic styling from settings
  fontSize: number;
  primaryColor: string;

  // Actions
  setThemeKey: (key: ThemeKey) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setPattern: (pattern: PatternType) => void;
  setLayout: (layout: LayoutArrangement) => void;
  toggleDarkMode: () => void;

  // Helpers
  getThemeColor: (colorPath: string) => string;
  getFontSize: (
    scale?: number | "xs" | "sm" | "md" | "lg" | "xl" | "xxl",
  ) => number;
  availableThemes: { key: ThemeKey; name: string; preview: string[] }[];
  availablePatterns: { key: PatternType; name: string; icon: string }[];
  availableLayouts: { key: LayoutArrangement; name: string; icon: string }[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Theme metadata for picker UI
const THEME_METADATA: { key: ThemeKey; name: string; preview: string[] }[] = [
  { key: "light", name: "Light", preview: ["#FAFBFC", "#0969DA", "#1A7F37"] },
  { key: "dark", name: "Midnight", preview: ["#0D1117", "#58A6FF", "#3FB950"] },
];

// Pattern metadata
const PATTERN_METADATA: { key: PatternType; name: string; icon: string }[] = [
  { key: "none", name: "None", icon: "remove-circle-outline" },
  { key: "dots", name: "Dots", icon: "ellipsis-horizontal" },
  { key: "grid", name: "Grid", icon: "grid-outline" },
  { key: "waves", name: "Waves", icon: "water-outline" },
  { key: "aurora", name: "Aurora", icon: "color-wand-outline" },
  { key: "mesh", name: "Mesh", icon: "apps-outline" },
  { key: "circuit", name: "Circuit", icon: "git-network-outline" },
  { key: "hexagon", name: "Hexagon", icon: "diamond-outline" },
];

// Layout metadata
const LAYOUT_METADATA: {
  key: LayoutArrangement;
  name: string;
  icon: string;
}[] = [
    { key: "default", name: "Default", icon: "apps-outline" },
    { key: "compact", name: "Compact", icon: "contract-outline" },
    { key: "spacious", name: "Spacious", icon: "expand-outline" },
    { key: "cards", name: "Cards", icon: "albums-outline" },
    { key: "list", name: "List", icon: "list-outline" },
    { key: "grid", name: "Grid", icon: "grid-outline" },
  ];

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const systemColorScheme = useColorScheme();
  const { settings } = useSettingsStore();
  const userId = useAuthStore((state) => state.user?.id ?? null);

  // State
  const [, setThemeKeyState] = useState<ThemeKey>("light");
  const [themeMode, setThemeModeState] = useState<ThemeMode>("light");
  const [pattern, setPatternState] = useState<PatternType>("none");
  const [layout, setLayoutState] = useState<LayoutArrangement>("default");
  const [isInitialized, setIsInitialized] = useState(false);

  // Get dynamic values from settings store
  const normalizedTheme = normalizeThemePreference(settings.theme);
  const fontSize = settings.fontSizeValue || 16;
  const fontFamilies = resolveFontFamilies(settings.fontStyle);
  const primaryColor = themes[normalizedTheme]?.colors.accent || "#0EA5E9";

  // Compute effective theme based on mode
  const effectiveThemeKey = useMemo((): ThemeKey => {
    return themeMode === "dark" ? "dark" : "light";
  }, [themeMode]);

  const theme = useMemo<AppTheme>(() => {
    const resolved = (themes as any)?.[effectiveThemeKey] as
      | AppTheme
      | undefined;
    const fallback = (themes as any)?.premium ?? (themes as any)?.light;
    return (resolved ??
      fallback ??
      (Object.values(themes)[0] as AppTheme)) as AppTheme;
  }, [effectiveThemeKey]);

  const isDark = useMemo(() => {
    return effectiveThemeKey === "dark";
  }, [effectiveThemeKey]);

  const themeLegacy = useMemo<ThemeContextType["themeLegacy"]>(() => {
    const resolvedPrimary = theme.colors.accent;
    const baseFontSize = fontSize;

    const fontSizeTokens = {
      xs: Math.max(12, Math.round(baseFontSize * 0.75)),
      sm: Math.max(14, Math.round(baseFontSize * 0.875)),
      md: baseFontSize,
      lg: Math.round(baseFontSize * 1.125),
      xl: Math.round(baseFontSize * 1.25),
      xxl: Math.round(baseFontSize * 1.5),
    };

    return {
      theme: isDark ? "dark" : "light",
      isDark,
      colors: {
        primary: resolvedPrimary,
        secondary: theme.colors.text.muted,
        muted: theme.colors.text.muted,
        background: theme.colors.background.default,
        surface: theme.colors.background.paper,
        surfaceElevated: theme.colors.background.elevated,
        surfaceDark: theme.colors.background.elevated,
        text: theme.colors.text.primary,
        textTokens: theme.colors.text,
        textPrimary: theme.colors.text.primary,
        textSecondary: theme.colors.text.secondary,
        textTertiary: theme.colors.text.muted,
        border: theme.colors.border.light,
        borderLight: theme.colors.border.light,
        error: theme.colors.error.main,
        success: theme.colors.success.main,
        warning: theme.colors.warning.main,
        info: theme.colors.info.main,
        danger: theme.colors.danger,
        overlay: theme.colors.background.overlay,
        overlayPrimary: hexToRgba(resolvedPrimary, isDark ? 0.16 : 0.12),
        accent: theme.colors.accent,
        accentLight: theme.colors.accentLight,
        accentDark: theme.colors.accentDark,
        glass: theme.colors.background.glass,
        card: theme.colors.background.paper,
        placeholder: theme.colors.text.muted,
        disabled: theme.colors.text.disabled,
      },
      gradients: theme.gradients,
      spacing: {
        xs: 4,
        sm: 8,
        md: 16,
        base: 16,
        lg: 24,
        xl: 32,
        xxl: 48,
      },
      typography: {
        ...theme.typography,
        fontFamily: {
          ...(theme.typography as any)?.fontFamily,
          ...fontFamilies,
        },
        fontSize: {
          ...(theme.typography as any)?.fontSize,
          ...fontSizeTokens,
        },
      },
      borderRadius: {
        sm: 4,
        md: 8,
        lg: 12,
        xl: 16,
        round: 50,
      },
      shadows: theme.shadows,
      animations: theme.animations,
      componentSizes: theme.componentSizes,
      layout: theme.layout,
    };
  }, [fontFamilies, fontSize, isDark, theme]);

  // Sync theme context to the scoped settings store and clear retired pattern/layout state.
  useEffect(() => {
    setThemeModeState(normalizedTheme);
    setThemeKeyState(normalizedTheme);
    setPatternState("none");
    setLayoutState("default");
    setIsInitialized(true);
  }, [normalizedTheme, userId]);

  // Actions
  const setThemeKey = useCallback((key: ThemeKey) => {
    const nextTheme = key === "dark" ? "dark" : "light";
    setThemeKeyState(nextTheme);
    setThemeModeState(nextTheme);
    if (useSettingsStore.getState().settings.theme !== nextTheme) {
      useSettingsStore.getState().setSetting("theme", nextTheme);
    }
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    const nextTheme =
      mode === "system"
        ? systemColorScheme === "dark"
          ? "dark"
          : "light"
        : mode === "dark"
          ? "dark"
          : "light";
    setThemeModeState(nextTheme);
    setThemeKeyState(nextTheme);
    if (useSettingsStore.getState().settings.theme !== nextTheme) {
      useSettingsStore.getState().setSetting("theme", nextTheme);
    }
  }, [systemColorScheme]);

  const setPattern = useCallback((p: PatternType) => {
    setPatternState(p);
  }, []);

  const setLayout = useCallback((l: LayoutArrangement) => {
    setLayoutState(l);
  }, []);

  const toggleDarkMode = useCallback(() => {
    setThemeMode(themeMode === "dark" ? "light" : "dark");
  }, [themeMode, setThemeMode]);

  // Helper to get nested color value
  const getThemeColor = useCallback(
    (colorPath: string): string => {
      const currentTheme = theme!;
      const parts = colorPath.split(".");
      let value: any = currentTheme.colors;
      for (const part of parts) {
        value = value?.[part];
      }
      return typeof value === "string"
        ? value
        : currentTheme.colors.text.primary;
    },
    [theme],
  );

  // Helper to get scaled font size based on user preference
  const getFontSize = useCallback(
    (scale: number | "xs" | "sm" | "md" | "lg" | "xl" | "xxl" = 1): number => {
      const namedScales: Record<
        "xs" | "sm" | "md" | "lg" | "xl" | "xxl",
        number
      > = {
        xs: 0.75,
        sm: 0.875,
        md: 1,
        lg: 1.125,
        xl: 1.25,
        xxl: 1.5,
      };

      const numericScale =
        typeof scale === "number" ? scale : (namedScales[scale] ?? 1);
      return Math.round(fontSize * numericScale);
    },
    [fontSize],
  );

  const contextValue = useMemo<ThemeContextType>(
    () => ({
      theme: theme!,
      themeLegacy,
      themeKey: effectiveThemeKey,
      themeMode,
      isDark,
      pattern,
      layout,
      fontSize,
      primaryColor,
      setThemeKey,
      setThemeMode,
      setPattern,
      setLayout,
      toggleDarkMode,
      getThemeColor,
      getFontSize,
      availableThemes: THEME_METADATA,
      availablePatterns: PATTERN_METADATA,
      availableLayouts: LAYOUT_METADATA,
    }),
    [
      theme,
      themeLegacy,
      effectiveThemeKey,
      themeMode,
      isDark,
      pattern,
      layout,
      fontSize,
      primaryColor,
      setThemeKey,
      setThemeMode,
      setPattern,
      setLayout,
      toggleDarkMode,
      getThemeColor,
      getFontSize,
    ],
  );

  if (!isInitialized) {
    // Return a loading placeholder instead of null to prevent blank screen
    return (
      <ThemeContext.Provider value={contextValue}>
        {children}
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

// Hook to use theme context
export const useThemeContext = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    console.warn("useThemeContext called outside ThemeProvider - returning default theme");
    return {
      theme: themes.light!,
      themeLegacy: {
        theme: "light",
        isDark: false,
        colors: {
          primary: "#0EA5E9",
          secondary: "#6B7280",
          muted: "#9CA3AF",
          background: "#FAFBFC",
          surface: "#FFFFFF",
          surfaceElevated: "#F9FAFB",
          surfaceDark: "#F3F4F6",
          text: "#111827",
          textTokens: { primary: "#111827", secondary: "#6B7280", muted: "#9CA3AF" },
          textPrimary: "#111827",
          textSecondary: "#6B7280",
          textTertiary: "#9CA3AF",
          border: "#E5E7EB",
          borderLight: "#F3F4F6",
          error: "#EF4444",
          success: "#10B981",
          warning: "#F59E0B",
          info: "#3B82F6",
          danger: "#DC2626",
          overlay: "rgba(0, 0, 0, 0.5)",
          overlayPrimary: "rgba(14, 165, 233, 0.12)",
          accent: "#0EA5E9",
          accentLight: "#38BDF8",
          accentDark: "#0284C7",
          glass: "rgba(255, 255, 255, 0.1)",
          card: "#FFFFFF",
          placeholder: "#9CA3AF",
          disabled: "#9CA3AF",
        },
        gradients: { primary: ["#0EA5E9", "#0284C7"], secondary: ["#10B981", "#059669"] },
        spacing: { xs: 4, sm: 8, md: 16, base: 16, lg: 24, xl: 32, xxl: 48 },
        typography: { fontSize: { xs: 12, sm: 14, md: 16, lg: 18, xl: 20, xxl: 24 } },
        borderRadius: { sm: 4, md: 8, lg: 12, xl: 16, round: 50 },
        shadows: { sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)", md: "0 4px 6px -1px rgba(0, 0, 0, 0.1)", lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1)", xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" },
        animations: { duration: 300, easing: "ease-in-out" },
        componentSizes: { button: 48, input: 48, card: 16 },
        layout: { padding: 16, margin: 16 },
      },
      themeKey: "light",
      themeMode: "light",
      isDark: false,
      pattern: "none",
      layout: "default",
      fontSize: 16,
      primaryColor: "#0EA5E9",
      setThemeKey: () => { },
      setThemeMode: () => { },
      setPattern: () => { },
      setLayout: () => { },
      toggleDarkMode: () => { },
      getThemeColor: (_colorPath: string) => "#0EA5E9",
      getFontSize: (_scale?: number | "xs" | "sm" | "md" | "lg" | "xl" | "xxl") => 16,
      availableThemes: THEME_METADATA,
      availablePatterns: PATTERN_METADATA,
      availableLayouts: LAYOUT_METADATA,
    };
  }
  return context;
};

// Optional hook that doesn't throw (for components that may be outside provider)
export const useThemeContextSafe = (): ThemeContextType | null => {
  return useContext(ThemeContext) ?? null;
};

export default ThemeContext;
