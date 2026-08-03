---
# Design System Tokens (Machine-readable)
tokens:
  colors:
    primary: "#3B82F6"
    secondary: "#06B6D4"
    success: "#22C55E"
    warning: "#F59E0B"
    error: "#EF4444"
    info: "#3B82F6"
    neutral:
      50: "#F8FAFC"
      100: "#F1F5F9"
      200: "#E2E8F0"
      300: "#CBD5E1"
      400: "#94A3B8"
      500: "#64748B"
      600: "#475569"
      700: "#334155"
      800: "#1E293B"
      900: "#0F172A"
    background:
      primary: "#FFFFFF"
      secondary: "#F8FAFC"
    text:
      primary: "#0F172A"
      secondary: "#475569"
      muted: "#94A3B8"
      inverse: "#FFFFFF"
  spacing:
    base: 4
    xs: 4
    sm: 8
    md: 12
    lg: 16
    xl: 20
    "2xl": 24
    "3xl": 32
  radius:
    none: 0
    xs: 4
    sm: 8
    md: 12
    lg: 16
    xl: 20
    full: 9999
  typography:
    family:
      sans: "System"
      mono: "Menlo, monospace"
    size:
      xs: 10
      sm: 12
      md: 14
      lg: 16
      xl: 18
      "2xl": 20
      "3xl": 24
    weight:
      regular: "400"
      medium: "500"
      semibold: "600"
      bold: "700"

  components:
    button:
      radius: 8
      minHeight: 44
      padding: 12
    card:
      radius: 12
      padding: 16
      borderWidth: 1
    input:
      radius: 8
      minHeight: 44
      padding: 12
---

# Stock Verify Design System (DESIGN.md)

This document defines the visual language and design rules for the Stock Verify application. It is intended to be used by both human developers and AI agents (like Claude Code, Cursor, or Google Stitch) to maintain UI consistency.

## 1. Vision & Principles

Stock Verify is a professional mobile utility for warehouse inventory management.
- **Functional over Decorative**: Prioritize clarity and data density.
- **Semantic Feedback**: Use colors to communicate state clearly (success, warning, error).
- **Mobile First**: All components must be optimized for touch interactions and small screens.

## 2. Colors

We use a Slate-based neutral palette with an Electric Blue primary brand color.

### Brand Colors
- **Primary**: #3B82F6 (Blue 500) - Main actions and primary branding.
- **Secondary**: #06B6D4 (Cyan 500) - Supporting accents.

### Status Colors
- **Success**: #22C55E (Green 500) - Completed counts, verified items.
- **Warning**: #F59E0B (Amber 500) - Discrepancies, attention required.
- **Error**: #EF4444 (Red 500) - Failures, critical alerts.

### Neutral Scale (Slate)
Used for text, borders, and backgrounds to provide depth without color interference.

## 3. Typography

- **Font Family**: System default (San Francisco on iOS, Roboto on Android).
- **Scale**:
  - `Display`: 32px/40px Bold
  - `Heading`: 20px/24px SemiBold
  - `Body`: 16px Regular (Default)
  - `Body Small`: 14px Regular
  - `Caption`: 12px Regular

## 4. Spacing & Layout

We use an **8px grid** (with 4px increments for tight spaces).
- **Screen Padding**: 16px (lg)
- **Item Gap**: 12px (md)
- **Section Gap**: 24px (2xl)

## 5. Components

### Buttons
- **Touch Target**: Minimum 44px height.
- **Border Radius**: 8px (sm).
- **Primary Style**: Filled with Primary color, White text.
- **Secondary Style**: Outlined with Neutral-300, Neutral-900 text.

### Cards
- **Background**: Surface/White (#FFFFFF).
- **Border**: 1px solid Neutral-200.
- **Radius**: 12px (md).
- **Padding**: 16px (lg).

### Inputs
- **Height**: 44px minimum.
- **Radius**: 8px.
- **Border**: 1px solid Neutral-300; 2px Primary-500 on focus.

## 6. Interaction & Accessibility

- **Contrast**: Maintain 4.5:1 ratio for all text.
- **Safe Areas**: Respect notches and home indicators.
- **Feedback**: Provide immediate visual response (ripple or opacity change) on press.
- **States**: Always define Loading, Empty, and Error states for data-driven components.
