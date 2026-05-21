/**
 * Enhanced Theme System v3.0 - Aurora Pro
 * Modern color schemes with improved contrast and visual appeal
 * Includes vibrant gradients and glassmorphism support
 */

import {
  modernLayout,
  modernColors,
  modernGradients,
  modernTypography,
  modernSpacing,
  modernBorderRadius,
  modernShadows,
  modernGlass,
  modernAnimations,
  modernComponentSizes,
} from "../styles/modernDesignSystem";

export type AppTheme = {
  colors: {
    background: {
      default: string;
      paper: string;
      elevated: string;
      overlay: string;
      glass: string;
    };
    text: {
      primary: string;
      secondary: string;
      tertiary: string;
      muted: string;
      disabled: string;
      inverse: string;
      link: string;
      linkHover: string;
    };
    primary: {
      500: string;
      600: string;
      400: string;
    };
    secondary: {
      500: string;
      600: string;
      400: string;
    };
    success: {
      main: string;
      light: string;
      dark: string;
      50: string;
      700: string;
    };
    error: {
      main: string;
      light: string;
      dark: string;
      50: string;
      700: string;
    };
    warning: {
      main: string;
      light: string;
      dark: string;
      50: string;
      700: string;
    };
    info: {
      main: string;
      light: string;
      50: string;
      700: string;
    };
    border: {
      light: string;
      medium: string;
      strong: string;
    };
    accent: string;
    accentLight: string;
    accentDark: string;
    danger: string; // Add danger alias
    overlay: string;
    glass: string;
    shimmer: readonly [string, string, string];
    // Aurora specific colors (gradients mostly)
    aurora: {
      primary: readonly [string, string, string];
      secondary: readonly [string, string, string];
      success: readonly [string, string, string];
      warm: readonly [string, string, string];
      dark: readonly [string, string, string];
    };
  };
  gradients: {
    primary: readonly [string, string, string];
    accent: readonly [string, string];
    surface: readonly [string, string];
    success: readonly [string, string];
    danger: readonly [string, string];
    // Aurora specific gradients
    aurora: readonly [string, string, string];
    auroraPrimary: readonly [string, string, string];
    auroraSecondary: readonly [string, string, string];
    auroraSuccess: readonly [string, string, string];
    auroraWarm: readonly [string, string, string];
    auroraDark: readonly [string, string, string];
  };
  spacing: {
    0: number;
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
    6: number;
    8: number;
    10: number;
    12: number;
    16: number;
    20: number;
    24: number;
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    "2xl": number;
    "3xl": number;
  };
  borderRadius: {
    none: number;
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    "2xl": number;
    "3xl": number;
    full: number;
    button: number;
    card: number;
    input: number;
    modal: number;
    badge: number;
  };
  radius: {
    none: number;
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    "2xl": number;
    "3xl": number;
    full: number;
    button: number;
    card: number;
    input: number;
    modal: number;
    badge: number;
  };
  typography: typeof modernTypography;
  shadows: typeof modernShadows;
  glass: typeof modernGlass;
  animations: typeof modernAnimations;
  componentSizes: typeof modernComponentSizes;
  layout: typeof modernLayout;
};

// Common Aurora tokens to reuse
const commonAurora = {
  colors: {
    accent: modernColors.primary[400],       // Terracotta 400
    accentLight: modernColors.primary[300],  // Terracotta 300
    accentDark: modernColors.primary[600],   // Terracotta 600
    danger: modernColors.error.main,
    overlay: "rgba(12, 10, 9, 0.5)",
    glass: "rgba(255, 250, 245, 0.12)",
    shimmer: ["rgba(204,120,92,0)", "rgba(232,144,110,0.06)", "rgba(204,120,92,0)"] as const,
    aurora: {
      primary: modernGradients.auroraPrimary,
      secondary: modernGradients.auroraSecondary,
      success: modernGradients.auroraSuccess,
      warm: modernGradients.auroraWarm,
      dark: modernGradients.auroraDark,
    },
  },
  gradients: {
    aurora: modernGradients.aurora,
    auroraPrimary: modernGradients.auroraPrimary,
    auroraSecondary: modernGradients.auroraSecondary,
    auroraSuccess: modernGradients.auroraSuccess,
    auroraWarm: modernGradients.auroraWarm,
    auroraDark: modernGradients.auroraDark,
  },
  typography: modernTypography,
  spacing: modernSpacing,
  borderRadius: modernBorderRadius,
  radius: modernBorderRadius,
  shadows: modernShadows,
  glass: modernGlass,
  animations: modernAnimations,
  componentSizes: modernComponentSizes,
  layout: modernLayout,
};

export const themes: Record<string, AppTheme> = {
  // Claude Light Theme — Warm Parchment & Terracotta
  light: {
    colors: {
      background: {
        default: "#FAF8F5",    // Warm parchment
        paper: "#FFFFFF",
        elevated: "#F7F4EF",   // Slightly warm elevated
        overlay: "rgba(28, 25, 23, 0.5)",
        glass: "rgba(255, 255, 255, 0.92)",
      },
      text: {
        primary: "#1C1917",    // Warm near-black
        secondary: "#6B6762",  // Warm gray
        tertiary: "#96918C",   // Muted warm
        muted: "#96918C",
        disabled: "#C4BFB9",
        inverse: "#FFFFFF",
        link: "#CC785C",       // Terracotta links
        linkHover: "#B06148",
      },
      primary: {
        500: "#CC785C",        // Claude Terracotta
        600: "#B06148",
        400: "#E8906E",
      },
      secondary: {
        500: "#78716C",        // Warm stone
        600: "#58534E",
        400: "#A09590",
      },
      success: {
        main: "#16A34A",
        light: "#22C55E",
        dark: "#15803D",
        50: "#F0FDF4",
        700: "#15803D",
      },
      error: {
        main: "#DC2626",
        light: "#EF4444",
        dark: "#B91C1C",
        50: "#FEF2F2",
        700: "#B91C1C",
      },
      warning: {
        main: "#D97706",
        light: "#F59E0B",
        dark: "#B45309",
        50: "#FFFBEB",
        700: "#B45309",
      },
      info: {
        main: "#0284C7",
        light: "#38BDF8",
        50: "#F0F9FF",
        700: "#0369A1",
      },
      border: {
        light: "#EDE9E4",      // Very subtle warm border
        medium: "#D7D1CB",     // Medium warm border
        strong: "#B5AFA9",     // Strong warm border
      },
      accent: "#CC785C",       // Terracotta
      accentLight: "#E8906E",
      accentDark: "#B06148",
      danger: "#DC2626",
      overlay: "rgba(28, 25, 23, 0.5)",
      glass: "rgba(255, 255, 255, 0.88)",
      shimmer: ["#E7E3DE", "#FAF8F5", "#E7E3DE"],
      aurora: {
        ...commonAurora.colors.aurora,
      },
    },
    gradients: {
      primary: ["#E8906E", "#CC785C", "#B06148"],
      accent: ["#F5B942", "#E8A020"],
      surface: ["#FFFFFF", "#F7F4EF"],
      success: ["#22C55E", "#16A34A"],
      danger: ["#EF4444", "#DC2626"],
      ...commonAurora.gradients,
    },
    spacing: commonAurora.spacing,
    borderRadius: commonAurora.borderRadius,
    radius: commonAurora.borderRadius,
    typography: commonAurora.typography,
    shadows: commonAurora.shadows,
    glass: commonAurora.glass,
    animations: commonAurora.animations,
    componentSizes: commonAurora.componentSizes,
    layout: commonAurora.layout,
  },

  // Claude Dark Theme — Warm Charcoal & Terracotta
  dark: {
    colors: {
      background: {
        default: "#1C1917",    // Warm charcoal (not cold navy)
        paper: "#242220",      // Slightly lighter warm charcoal
        elevated: "#2E2B28",   // Elevated warm surface
        overlay: "rgba(12, 10, 9, 0.82)",
        glass: "rgba(36, 34, 32, 0.88)",
      },
      text: {
        primary: "#F5F0E8",    // Warm cream
        secondary: "#B5AFA9",  // Warm stone
        tertiary: "#78746F",   // Muted warm
        muted: "#78746F",
        disabled: "#58534E",
        inverse: "#1C1917",
        link: "#E8906E",       // Bright terracotta links
        linkHover: "#CC785C",
      },
      primary: {
        500: "#E8906E",        // Bright terracotta for dark mode
        600: "#CC785C",
        400: "#F5A882",
      },
      secondary: {
        500: "#4ADE80",
        600: "#22C55E",
        400: "#86EFAC",
      },
      success: {
        main: "#4ADE80",
        light: "#86EFAC",
        dark: "#22C55E",
        50: "#0A1F0E",
        700: "#4ADE80",
      },
      error: {
        main: "#F87171",
        light: "#FCA5A5",
        dark: "#EF4444",
        50: "#1F0A0A",
        700: "#F87171",
      },
      warning: {
        main: "#FBBF24",
        light: "#FDE68A",
        dark: "#F59E0B",
        50: "#1A140A",
        700: "#FBBF24",
      },
      info: {
        main: "#38BDF8",
        light: "#7DD3FC",
        50: "#071620",
        700: "#38BDF8",
      },
      border: {
        light: "#3D3A37",      // Warm dark border
        medium: "#4A4744",
        strong: "#58534E",
      },
      accent: "#E8906E",       // Bright terracotta
      accentLight: "#F5A882",
      accentDark: "#CC785C",
      danger: "#F87171",
      overlay: "rgba(12, 10, 9, 0.82)",
      glass: "rgba(36, 34, 32, 0.88)",
      shimmer: ["#2E2B28", "#3D3A37", "#2E2B28"],
      aurora: {
        ...commonAurora.colors.aurora,
      },
    },
    gradients: {
      primary: ["#F5A882", "#E8906E", "#CC785C"],
      accent: ["#F5A882", "#E8906E"],
      surface: ["#2E2B28", "#242220"],
      success: ["#86EFAC", "#4ADE80"],
      danger: ["#FCA5A5", "#F87171"],
      ...commonAurora.gradients,
    },
    spacing: commonAurora.spacing,
    borderRadius: commonAurora.borderRadius,
    radius: commonAurora.borderRadius,
    typography: commonAurora.typography,
    shadows: commonAurora.shadows,
    glass: commonAurora.glass,
    animations: commonAurora.animations,
    componentSizes: commonAurora.componentSizes,
    layout: commonAurora.layout,
  },

  // Claude Premium — Deep Warm & Terracotta
  premium: {
    colors: {
      background: {
        default: "#18140F", // Deep warm espresso
        paper: "#22190F",   // Warm dark brown-black
        elevated: "#2E2318",
        overlay: "rgba(18, 14, 9, 0.95)",
        glass: "rgba(34, 25, 15, 0.82)",
      },
      text: {
        primary: "#F5F0E8",
        secondary: "#C4B8A8",
        tertiary: "#8C7F72",
        muted: "#8C7F72",
        disabled: "#6B6057",
        inverse: "#1C1917",
        link: "#E8906E",
        linkHover: "#F5A882",
      },
      primary: {
        500: "#E8906E",
        600: "#CC785C",
        400: "#F5A882",
      },
      secondary: {
        500: "#4ADE80",
        600: "#22C55E",
        400: "#86EFAC",
      },
      success: {
        main: "#4ADE80",
        light: "#86EFAC",
        dark: "#22C55E",
        50: "#0A1F0E",
        700: "#4ADE80",
      },
      error: {
        main: "#F87171",
        light: "#FCA5A5",
        dark: "#EF4444",
        50: "#1F0A0A",
        700: "#F87171",
      },
      warning: {
        main: "#FBBF24",
        light: "#FDE68A",
        dark: "#F59E0B",
        50: "#1A140A",
        700: "#FBBF24",
      },
      info: {
        main: "#38BDF8",
        light: "#7DD3FC",
        50: "#071620",
        700: "#38BDF8",
      },
      border: {
        light: "#3D3020",
        medium: "#2E2318",
        strong: "#2E2318",
      },
      accent: "#E8906E",
      accentLight: "#F5A882",
      accentDark: "#CC785C",
      danger: "#F87171",
      overlay: "rgba(18, 14, 9, 0.92)",
      glass: "rgba(34, 25, 15, 0.78)",
      shimmer: ["#2E2318", "#3D3020", "#2E2318"],
      aurora: {
        ...commonAurora.colors.aurora,
      },
    },
    gradients: {
      primary: ["#F5A882", "#E8906E", "#CC785C"],
      accent: ["#F5A882", "#E8906E"],
      surface: ["#2E2318", "#22190F"],
      success: ["#86EFAC", "#4ADE80"],
      danger: ["#FCA5A5", "#F87171"],
      ...commonAurora.gradients,
    },
    spacing: commonAurora.spacing,
    borderRadius: commonAurora.borderRadius,
    radius: commonAurora.borderRadius,
    typography: commonAurora.typography,
    shadows: commonAurora.shadows,
    glass: commonAurora.glass,
    animations: commonAurora.animations,
    componentSizes: commonAurora.componentSizes,
    layout: commonAurora.layout,
  },

  // Ocean Pro - Teal & Cyan Harmony
  ocean: {
    colors: {
      background: {
        default: "#042F2E",
        paper: "#0D3D3B",
        elevated: "#134E4A",
        overlay: "rgba(4, 47, 46, 0.9)",
        glass: "rgba(13, 61, 59, 0.8)",
      },
      text: {
        primary: "#F0FDFA",
        secondary: "#99F6E4",
        tertiary: "#5EEAD4",
        muted: "#5EEAD4",
        disabled: "#5EEAD4",
        inverse: "#042F2E",
        link: "#14B8A6",
        linkHover: "#2DD4BF",
      },
      primary: {
        500: "#14B8A6",
        600: "#0D9488",
        400: "#2DD4BF",
      },
      secondary: {
        500: "#22C55E",
        600: "#22C55E",
        400: "#4ADE80",
      },
      success: {
        main: "#22C55E",
        light: "#4ADE80",
        dark: "#166534",
        50: "#F0FDF4",
        700: "#15803D",
      },
      error: {
        main: "#F43F5E",
        light: "#FB7185",
        dark: "#9F1239",
        50: "#FFF1F2",
        700: "#BE123C",
      },
      warning: {
        main: "#F59E0B",
        light: "#FBBF24",
        dark: "#92400E",
        50: "#FFFBEB",
        700: "#B45309",
      },
      info: {
        main: "#0EA5E9",
        light: "#38BDF8",
        50: "#F0F9FF",
        700: "#0EA5E9",
      },
      border: {
        light: "#1D6B67",
        medium: "#134E4A",
        strong: "#134E4A",
      },
      accent: "#14B8A6",
      accentLight: "#2DD4BF",
      accentDark: "#0D9488",
      danger: "#F43F5E",
      overlay: "rgba(4, 47, 46, 0.9)",
      glass: "rgba(13, 61, 59, 0.8)",
      shimmer: ["#134E4A", "#1D6B67", "#134E4A"],
      aurora: {
        ...commonAurora.colors.aurora,
      },
    },
    gradients: {
      primary: ["#14B8A6", "#0D9488", "#0F766E"],
      accent: ["#2DD4BF", "#14B8A6"],
      surface: ["#134E4A", "#0D3D3B"],
      success: ["#4ADE80", "#22C55E"],
      danger: ["#FB7185", "#F43F5E"],
      ...commonAurora.gradients,
    },
    spacing: commonAurora.spacing,
    borderRadius: commonAurora.borderRadius,
    radius: commonAurora.borderRadius,
    typography: commonAurora.typography,
    shadows: commonAurora.shadows,
    glass: commonAurora.glass,
    animations: commonAurora.animations,
    componentSizes: commonAurora.componentSizes,
    layout: commonAurora.layout,
  },

  // Sunset Warm - Orange & Rose Vibrancy
  sunset: {
    colors: {
      background: {
        default: "#1C1917",
        paper: "#292524",
        elevated: "#3B3835",
        overlay: "rgba(28, 25, 23, 0.9)",
        glass: "rgba(41, 37, 36, 0.85)",
      },
      text: {
        primary: "#FAFAF9",
        secondary: "#E7E5E4",
        tertiary: "#A8A29E",
        muted: "#A8A29E",
        disabled: "#A8A29E",
        inverse: "#1C1917",
        link: "#F97316",
        linkHover: "#FB923C",
      },
      primary: {
        500: "#F97316",
        600: "#EA580C",
        400: "#FB923C",
      },
      secondary: {
        500: "#22C55E",
        600: "#22C55E",
        400: "#4ADE80",
      },
      success: {
        main: "#22C55E",
        light: "#4ADE80",
        dark: "#166534",
        50: "#F0FDF4",
        700: "#15803D",
      },
      error: {
        main: "#E11D48",
        light: "#FB7185",
        dark: "#9F1239",
        50: "#FFF1F2",
        700: "#BE123C",
      },
      warning: {
        main: "#FACC15",
        light: "#FDE047",
        dark: "#A16207",
        50: "#FEFCE8",
        700: "#A16207",
      },
      info: {
        main: "#0EA5E9",
        light: "#38BDF8",
        50: "#F0F9FF",
        700: "#0EA5E9",
      },
      border: {
        light: "#57534E",
        medium: "#3B3835",
        strong: "#3B3835",
      },
      accent: "#F97316",
      accentLight: "#FB923C",
      accentDark: "#EA580C",
      danger: "#E11D48",
      overlay: "rgba(28, 25, 23, 0.9)",
      glass: "rgba(41, 37, 36, 0.85)",
      shimmer: ["#3B3835", "#57534E", "#3B3835"],
      aurora: {
        ...commonAurora.colors.aurora,
      },
    },
    gradients: {
      primary: ["#F97316", "#EA580C", "#C2410C"],
      accent: ["#FB923C", "#F97316"],
      surface: ["#3B3835", "#292524"],
      success: ["#4ADE80", "#22C55E"],
      danger: ["#FB7185", "#E11D48"],
      ...commonAurora.gradients,
    },
    spacing: commonAurora.spacing,
    borderRadius: commonAurora.borderRadius,
    radius: commonAurora.borderRadius,
    typography: commonAurora.typography,
    shadows: commonAurora.shadows,
    glass: commonAurora.glass,
    animations: commonAurora.animations,
    componentSizes: commonAurora.componentSizes,
    layout: commonAurora.layout,
  },

  // High Contrast - Maximum Accessibility
  highContrast: {
    colors: {
      background: {
        default: "#000000",
        paper: "#0A0A0A",
        elevated: "#171717",
        overlay: "rgba(0, 0, 0, 0.95)",
        glass: "rgba(10, 10, 10, 0.9)",
      },
      text: {
        primary: "#FFFFFF",
        secondary: "#E5E5E5",
        tertiary: "#A3A3A3",
        muted: "#A3A3A3",
        disabled: "#A3A3A3",
        inverse: "#000000",
        link: "#00D4FF",
        linkHover: "#5CE1FF",
      },
      primary: {
        500: "#00D4FF",
        600: "#00B8E0",
        400: "#5CE1FF",
      },
      secondary: {
        500: "#00FF88",
        600: "#00FF88",
        400: "#5CFFA8",
      },
      success: {
        main: "#00FF88",
        light: "#5CFFA8",
        dark: "#008844",
        50: "#001108",
        700: "#00FF88",
      },
      error: {
        main: "#FF3366",
        light: "#FF6699",
        dark: "#AA0033",
        50: "#110005",
        700: "#FF3366",
      },
      warning: {
        main: "#FFD700",
        light: "#FFE44D",
        dark: "#AA8800",
        50: "#111100",
        700: "#FFD700",
      },
      info: {
        main: "#00D4FF",
        light: "#5CE1FF",
        50: "#00111A",
        700: "#00D4FF",
      },
      border: {
        light: "#525252",
        medium: "#404040",
        strong: "#404040",
      },
      accent: "#00D4FF",
      accentLight: "#5CE1FF",
      accentDark: "#00B8E0",
      danger: "#FF3366",
      overlay: "rgba(0, 0, 0, 0.95)",
      glass: "rgba(10, 10, 10, 0.9)",
      shimmer: ["#171717", "#262626", "#171717"],
      aurora: {
        ...commonAurora.colors.aurora,
      },
    },
    gradients: {
      primary: ["#00D4FF", "#00B8E0", "#0099CC"],
      accent: ["#5CE1FF", "#00D4FF"],
      surface: ["#171717", "#0A0A0A"],
      success: ["#5CFFA8", "#00FF88"],
      danger: ["#FF6699", "#FF3366"],
      ...commonAurora.gradients,
    },
    spacing: commonAurora.spacing,
    borderRadius: commonAurora.borderRadius,
    radius: commonAurora.borderRadius,
    typography: commonAurora.typography,
    shadows: commonAurora.shadows,
    glass: commonAurora.glass,
    animations: commonAurora.animations,
    componentSizes: commonAurora.componentSizes,
    layout: commonAurora.layout,
  },
};

// Default theme export for quick access
export const defaultTheme = themes.light;
