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
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { colorPalette } from "@/theme/designTokens";
import { hitSlop, touchTargets } from "@/theme/legacyCompat";
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
  const uiTokens = useUiTokens();
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

  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        container: {
          flexDirection: "row",
          alignItems: "flex-start",
          minHeight: touchTargets.minimum,
          paddingVertical: uiTokens.spacing.xs,
        },
        checkbox: {
          width: 20,
          height: 20,
          borderRadius: uiTokens.radius.sm,
          borderWidth: 2,
          borderColor: uiTokens.colors.border,
          alignItems: "center",
          justifyContent: "center",
          marginRight: uiTokens.spacing.sm,
          marginTop: 2,
          backgroundColor: uiTokens.colors.surface,
        },
        checkboxChecked: {
          borderColor: uiTokens.colors.accent,
          backgroundColor: uiTokens.colors.accent,
        },
        checkboxDisabled: {
          borderColor: colorWithAlpha(uiTokens.colors.border, 0.45),
          backgroundColor: colorWithAlpha(uiTokens.colors.surface, 0.8),
        },
        checkboxDisabledChecked: {
          borderColor: colorWithAlpha(uiTokens.colors.border, 0.6),
          backgroundColor: colorWithAlpha(uiTokens.colors.border, 0.45),
        },
        labelContainer: {
          flex: 1,
          paddingTop: 1,
        },
        label: {
          fontSize: 14,
          fontWeight: "500",
          color: uiTokens.colors.textPrimary,
        },
        labelDisabled: {
          color: uiTokens.colors.textMuted,
        },
        description: {
          fontSize: 12,
          color: uiTokens.colors.textSecondary,
          marginTop: uiTokens.spacing.xs,
        },
        descriptionDisabled: {
          color: uiTokens.colors.textMuted,
        },
      }),
    [uiTokens]
  );

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      disabled={disabled}
      activeOpacity={0.8}
      hitSlop={hitSlop.small}
      accessibilityRole="checkbox"
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
            color={disabled ? uiTokens.colors.textMuted : colorPalette.neutral[0]}
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
