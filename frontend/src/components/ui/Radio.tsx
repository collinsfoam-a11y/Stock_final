/**
 * Radio Component
 * Single selection radio buttons
 * Phase 2: Design System - Core Components
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { hitSlop, touchTargets } from "@/theme/legacyCompat";
import { haptics } from "@/services/haptics";

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface RadioProps {
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const Radio: React.FC<RadioProps> = ({
  options,
  value,
  onChange,
  disabled = false,
}) => {
  const uiTokens = useUiTokens();
  const styles = React.useMemo(
    () =>
      StyleSheet.create({
        container: {
          gap: uiTokens.spacing.sm,
        },
        item: {
          flexDirection: "row",
          alignItems: "flex-start",
          minHeight: touchTargets.minimum,
          paddingVertical: uiTokens.spacing.xs,
        },
        radio: {
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: uiTokens.colors.border,
          alignItems: "center",
          justifyContent: "center",
          marginRight: uiTokens.spacing.sm,
          marginTop: 2,
          backgroundColor: uiTokens.colors.surface,
        },
        radioSelected: {
          borderColor: uiTokens.colors.accent,
        },
        radioDisabled: {
          borderColor: colorWithAlpha(uiTokens.colors.border, 0.45),
          backgroundColor: colorWithAlpha(uiTokens.colors.surface, 0.8),
        },
        radioDisabledSelected: {
          borderColor: colorWithAlpha(uiTokens.colors.border, 0.6),
        },
        radioInner: {
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: "transparent",
        },
        radioInnerSelected: {
          backgroundColor: uiTokens.colors.accent,
        },
        radioInnerDisabledSelected: {
          backgroundColor: uiTokens.colors.textMuted,
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
    <View style={styles.container}>
      {options.map((option) => (
        <RadioItem
          key={option.value}
          option={option}
          selected={value === option.value}
          onSelect={() => onChange(option.value)}
          disabled={disabled || option.disabled}
          styles={styles}
        />
      ))}
    </View>
  );
};

interface RadioItemProps {
  option: RadioOption;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  styles: ReturnType<typeof StyleSheet.create>;
}

const RadioItem: React.FC<RadioItemProps> = ({
  option,
  selected,
  onSelect,
  disabled = false,
  styles,
}) => {
  const scale = useSharedValue(selected ? 1 : 0);

  React.useEffect(() => {
    scale.value = withSpring(selected ? 1 : 0, {
      damping: 15,
      stiffness: 150,
    });
  }, [selected, scale]);

  const innerCircleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <TouchableOpacity
      style={styles.item}
      onPress={() => {
        void haptics.light();
        onSelect();
      }}
      disabled={disabled}
      activeOpacity={0.8}
      hitSlop={hitSlop.small}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
    >
      <View
        style={[
          styles.radio,
          selected && styles.radioSelected,
          disabled && styles.radioDisabled,
          disabled && selected && styles.radioDisabledSelected,
        ]}
      >
        <Animated.View
          style={[
            styles.radioInner,
            selected && styles.radioInnerSelected,
            disabled && selected && styles.radioInnerDisabledSelected,
            innerCircleStyle,
          ]}
        />
      </View>

      <View style={styles.labelContainer}>
        <Text style={[styles.label, disabled && styles.labelDisabled]}>
          {option.label}
        </Text>

        {option.description && (
          <Text
            style={[styles.description, disabled && styles.descriptionDisabled]}
          >
            {option.description}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};
