import React from 'react';
// eslint-disable-next-line no-restricted-imports
import { TouchableOpacityProps, ViewStyle, TouchableOpacity, AccessibilityRole } from 'react-native';

interface Props extends Omit<TouchableOpacityProps, 'accessibilityRole'> {
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole | string;
  minHitSize?: number;
}

export const AppTouchable = React.forwardRef<React.ElementRef<typeof TouchableOpacity>, Props>(({
  accessibilityLabel,
  accessibilityRole = 'button',
  minHitSize = 44,
  hitSlop,
  style,
  ...props
}, ref) => {
  const minSizeStyle: ViewStyle = {
    minWidth: minHitSize,
    minHeight: minHitSize,
  };

  return (
    <TouchableOpacity
      ref={ref}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole as AccessibilityRole}
      hitSlop={hitSlop || { top: 8, bottom: 8, left: 8, right: 8 }}
      style={[minSizeStyle, style]}
      {...props}
    />
  );
});
AppTouchable.displayName = 'AppTouchable';
