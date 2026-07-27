/**
 * WCAG AA Contrast Checker
 *
 * Validates that text/background color pairs meet WCAG 2.1 AA requirements:
 * - Normal text (< 18pt): 4.5:1 minimum contrast ratio
 * - Large text (>= 18pt or 14pt bold): 3:1 minimum contrast ratio
 *
 * Usage:
 *   import { wcag } from '@/theme/unified';
 *   const pass = wcag.isAA(textColor, backgroundColor);
 *   const ratio = wcag.getContrastRatio(textColor, backgroundColor);
 */

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace("#", "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) {
    return null;
  }
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

function relativeLuminance(r: number, g: number, b: number): number {
  const rs = r / 255;
  const gs = g / 255;
  const bs = b / 255;
  const rl = rs <= 0.03928 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
  const gl = gs <= 0.03928 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
  const bl = bs <= 0.03928 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

export function getContrastRatio(foreground: string, background: string): number {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);
  if (!fg || !bg) {
    return 0;
  }
  const l1 = relativeLuminance(fg.r, fg.g, fg.b);
  const l2 = relativeLuminance(bg.r, bg.g, bg.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function isAA(foreground: string, background: string, largeText = false): boolean {
  const ratio = getContrastRatio(foreground, background);
  const threshold = largeText ? 3 : 4.5;
  return ratio >= threshold;
}

export function isAAA(foreground: string, background: string, largeText = false): boolean {
  const ratio = getContrastRatio(foreground, background);
  const threshold = largeText ? 4.5 : 7;
  return ratio >= threshold;
}

export const wcag = {
  getContrastRatio,
  isAA,
  isAAA,
} as const;
