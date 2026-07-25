import { Platform, type AccessibilityState, type Insets } from "react-native";

export const TOUCH_TARGET_TOKENS = {
  compact: Platform.OS === "ios" ? 44 : 48,
  standard: Platform.OS === "ios" ? 48 : 52,
  large: 56,
} as const;

export const MIN_TOUCH_TARGET = TOUCH_TARGET_TOKENS.compact;
export const COMFORTABLE_TOUCH_TARGET = TOUCH_TARGET_TOKENS.standard;

export const OPERATIONAL_HIT_SLOP = {
  compact: { top: 6, bottom: 6, left: 6, right: 6 },
  standard: { top: 8, bottom: 8, left: 8, right: 8 },
  comfortable: { top: 12, bottom: 12, left: 12, right: 12 },
} as const satisfies Record<string, Insets>;

type AccessibleButtonOptions = {
  label: string;
  hint?: string;
  disabled?: boolean;
  selected?: boolean;
  busy?: boolean;
  expanded?: boolean;
  hitSlop?: Insets;
};

export function getAccessibilityState({
  busy,
  disabled,
  expanded,
  selected,
}: Omit<AccessibleButtonOptions, "label" | "hint" | "hitSlop">): AccessibilityState {
  return {
    ...(disabled !== undefined ? { disabled } : null),
    ...(selected !== undefined ? { selected } : null),
    ...(busy !== undefined ? { busy } : null),
    ...(expanded !== undefined ? { expanded } : null),
  };
}

export function getAccessibleButtonProps({
  label,
  hint,
  disabled,
  selected,
  busy,
  expanded,
  hitSlop = OPERATIONAL_HIT_SLOP.standard,
}: AccessibleButtonOptions) {
  return {
    accessibilityRole: "button" as const,
    accessibilityLabel: label,
    accessibilityHint: hint,
    accessibilityState: getAccessibilityState({ busy, disabled, expanded, selected }),
    hitSlop,
  };
}

export function getAccessibleToggleProps(options: AccessibleButtonOptions) {
  return {
    ...getAccessibleButtonProps(options),
    accessibilityState: getAccessibilityState({
      busy: options.busy,
      disabled: options.disabled,
      expanded: options.expanded,
      selected: options.selected,
    }),
  };
}

export function getMinimumTouchTargetStyle(size = MIN_TOUCH_TARGET) {
  return {
    minHeight: Math.max(size, MIN_TOUCH_TARGET),
    minWidth: Math.max(size, MIN_TOUCH_TARGET),
  };
}

export function getDecorativeIconProps() {
  return {
    accessibilityElementsHidden: true,
    importantForAccessibility: "no" as const,
    "aria-hidden": true,
  };
}
