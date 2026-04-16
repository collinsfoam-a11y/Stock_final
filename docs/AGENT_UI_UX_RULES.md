# Agent UI/UX Rules

This document distills the useful UI/UX agent patterns from external skill catalogs into rules that fit Stock Verify's mobile app.

## When To Use

Use these rules whenever a task changes:

- a screen, modal, form, chart, or navigation flow
- spacing, typography, color, elevation, or motion
- accessibility, responsiveness, or perceived polish

## Default Design Direction

For this repo, default to a functional mobile utility style:

- Clear hierarchy over decoration
- Semantic status colors over novelty palettes
- Simple surfaces over deep visual effects
- Consistent iconography over mixed visual languages
- Fast, obvious interactions over ornamental motion

For stock, recount, and admin workflows specifically:

- Prefer minimal or softly elevated surfaces
- Keep status cues semantic: success, warning, danger, info
- Use accent color to direct attention, not to decorate every element
- Avoid AI-purple or pink-heavy gradients on operational screens
- Avoid complex shadows, glass-heavy layering, and 3D styling on dense data screens

## UI/UX Workflow

1. Define the screen goal first.
2. Pick one visual direction for the screen.
3. Decide tokens before coding:
   - type scale
   - spacing rhythm
   - color roles
   - elevation pattern
   - motion style
4. Implement the smallest coherent change.
5. Verify with the checklist below before finishing.

## Required Interaction Rules

- Touch targets must be at least `44x44` points. Expand hit areas when icons are smaller.
- Keep at least `8dp` spacing between adjacent touch targets.
- Do not rely on hover-only behavior for core actions.
- Provide visible press, loading, success, error, and disabled states.
- Keep one primary CTA per screen whenever possible.
- Destructive actions must be visually separated and clearly labeled.

## Required Accessibility Rules

- Text contrast must meet at least `4.5:1` for normal text.
- Do not rely on color alone to communicate state.
- Keep focus order and screen-reader labels meaningful.
- Respect safe areas for headers, bottom bars, and fixed actions.
- Support text scaling and avoid layouts that break under larger text.
- Respect reduced-motion preferences.

## Motion Rules

- Use motion to clarify state or hierarchy, not as decoration.
- Keep most micro-interactions in the `150-300ms` range.
- Prefer `transform` and `opacity`; avoid layout-janking animation.
- Animations must be interruptible.
- Provide a reduced-motion fallback for non-essential transitions.

## Delivery Checklist

- Verify portrait on a small phone width first.
- Check landscape or tablet layout when the screen has dense controls.
- Review loading, empty, error, and success states.
- Confirm no content is hidden behind notches, gesture bars, or fixed toolbars.
- Check dark mode separately if the screen supports it.
- Confirm labels, helper text, and status messages are explicit.
