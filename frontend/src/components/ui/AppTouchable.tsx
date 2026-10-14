import React from 'react';
// eslint-disable-next-line no-restricted-imports
import { TouchableOpacityProps, ViewStyle, TouchableOpacity, AccessibilityRole, GestureResponderEvent } from 'react-native';
import { haptics } from "@/services/haptics";

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
  onPress,
  ...props
}, ref) => {
  const minSizeStyle: ViewStyle = {
    minWidth: minHitSize,
    minHeight: minHitSize,
  };

  const handlePress = React.useCallback(
    (event: GestureResponderEvent) => {
      void haptics.light();
      if (onPress) {
        onPress(event);
      }
    },
    [onPress]
  );

  return (
    <TouchableOpacity
      ref={ref}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole as AccessibilityRole}
      hitSlop={hitSlop || { top: 8, bottom: 8, left: 8, right: 8 }}
      style={[minSizeStyle, style]}
      onPress={onPress ? handlePress : undefined}
      {...props}
    />
  );
});
AppTouchable.displayName = 'AppTouchable';
