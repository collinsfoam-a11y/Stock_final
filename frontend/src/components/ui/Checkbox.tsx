/**
 * Checkbox Component
 * Multiple selection checkboxes
 * Phase 2: Design System - Core Components
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import {
  colors,
  semanticColors,
  spacing,
  radius,
  textStyles,
  touchTargets,
  hitSlop,
} from "@/theme/legacyCompat";
import { haptics } from "@/services/haptics";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  indeterminate?: boolean;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  indeterminate = false,
}) => {
  const isSelected = checked || indeterminate;
  const scale = useSharedValue(isSelected ? 1 : 0);

  React.useEffect(() => {
    scale.value = withSpring(isSelected ? 1 : 0, {
      damping: 15,
      stiffness: 150,
    });
  }, [isSelected, scale]);

  const checkmarkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    if (!disabled) {
      void haptics.light();
      onChange(!checked);
    }
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.8}
      hitSlop={hitSlop.small}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{
        checked: indeterminate ? "mixed" : checked,
        disabled,
      }}
    >
      <View
        style={[
          styles.checkbox,
          isSelected && styles.checkboxChecked,
          disabled && styles.checkboxDisabled,
          disabled && isSelected && styles.checkboxDisabledChecked,
        ]}
      >
        <Animated.View style={checkmarkStyle}>
          <Ionicons
            name={indeterminate ? "remove" : "checkmark"}
            size={16}
            color={disabled ? colors.neutral[700] : colors.white}
          />
        </Animated.View>
      </View>

      {(label || description) && (
        <View style={styles.labelContainer}>
          {label && (
            <Text style={[styles.label, disabled && styles.labelDisabled]}>
              {label}
            </Text>
          )}

          {description && (
            <Text
              style={[styles.description, disabled && styles.descriptionDisabled]}
            >
              {description}
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: touchTargets.minimum,
    paddingVertical: spacing.xs,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radius.xs,
    borderWidth: 2,
    borderColor: semanticColors.input.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
    marginTop: 2,
    backgroundColor: semanticColors.input.background,
  },
  checkboxChecked: {
    borderColor: semanticColors.interactive.default,
    backgroundColor: semanticColors.interactive.default,
  },
  checkboxDisabled: {
    borderColor: colors.neutral[300],
    backgroundColor: colors.neutral[100],
  },
  checkboxDisabledChecked: {
    borderColor: colors.neutral[400],
    backgroundColor: colors.neutral[300],
  },
  labelContainer: {
    flex: 1,
    paddingTop: 1,
  },
  label: {
    ...textStyles.bodySmall,
    fontWeight: "500",
    color: semanticColors.text.primary,
  },
  labelDisabled: {
    color: semanticColors.text.disabled,
  },
  description: {
    ...textStyles.caption,
    color: semanticColors.text.secondary,
    marginTop: spacing.xs,
  },
  descriptionDisabled: {
    color: semanticColors.text.disabled,
  },
});
