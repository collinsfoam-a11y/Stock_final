/**
 * Staff UI scale — single source of truth for typography, radius, spacing and
 * icon sizes across all staff-facing screens.
 *
 * Mirrors the design-system tokens but uses concrete numbers so StyleSheet.create
 * (which is called once at module load) gets stable values without needing the
 * uiTokens hook.  Color-aware values (backgrounds, borders, text) still come
 * from useUiTokens at render time.
 */

// ─── Typography ──────────────────────────────────────────────────────────────

export const font = {
  size: {
    /** Notification / dot badge */
    micro:    9,
    /** Section eyebrows, uppercase labels, status text */
    label:   11,
    /** Timestamps, secondary meta, captions */
    caption: 12,
    /** List secondary text, descriptions */
    sm:      13,
    /** Body text, chip text, hints */
    base:    14,
    /** Card item names, prominent body */
    md:      15,
    /** Card titles, modal labels */
    lg:      16,
    /** Section headings, stat numbers on cards */
    xl:      18,
    /** Screen hero numbers (scanned count, issue count) */
    display: 20,
    /** Item detail hero title */
    hero:    22,
    /** Large metric counters */
    metric:  28,
  },

  weight: {
    regular:   "400" as const,
    medium:    "500" as const,
    semibold:  "600" as const,
    bold:      "700" as const,
    extrabold: "800" as const,
  },

  /** Uppercase eyebrow labels get tight tracking; display numbers get negative tracking */
  tracking: {
    tight:  -0.4,
    normal:  0,
    wide:    0.6,
    wider:   0.9,
  },

  leading: {
    snug:   18,
    normal: 20,
    relaxed: 22,
  },
} as const;

// ─── Border Radius ────────────────────────────────────────────────────────────

export const radius = {
  /** Dot badge, micro indicator */
  xs:   4,
  /** Pill badge, status chip */
  sm:   8,
  /** Chip button, input */
  md:   10,
  /** Card, bottom sheet tile */
  lg:   12,
  /** Feature card, modal */
  xl:   16,
  /** Icon wrap, avatar */
  "2xl": 20,
  full: 999,
} as const;

// ─── Touch target / Icon sizes ────────────────────────────────────────────────

export const icon = {
  /** Inline label icon */
  xs:  12,
  /** Section heading icon */
  sm:  14,
  /** List row leading icon */
  md:  18,
  /** Hero card icon, header action icon */
  lg:  20,
  /** Feature card icon */
  xl:  24,
  /** Empty-state icon */
  "2xl": 36,
} as const;

export const touch = {
  /** Minimum tap area per WCAG */
  min: 44,
  /** Standard button height */
  base: 48,
  /** Compact chip / secondary button */
  sm: 40,
  /** Icon-only button */
  icon: 36,
} as const;

// ─── Spacing (pixel values for StyleSheet.create) ─────────────────────────────

export const gap = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
} as const;
