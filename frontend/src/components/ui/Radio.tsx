/**
 * Radio Component
 * Single selection radio buttons
 * Phase 2: Design System - Core Components
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import {
  colors,
  semanticColors,
  spacing,
  textStyles,
  touchTargets,
} from "@/theme/unified";
import { haptics } from "@/services/haptics";
import { OPERATIONAL_HIT_SLOP } from "@/utils/accessibility";

import { AppTouchable } from "@/components/ui/AppTouchable";

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
  return (
    <View style={styles.container}>
      {options.map((option) => (
        <RadioItem
          key={option.value}
          option={option}
          selected={value === option.value}
          onSelect={() => onChange(option.value)}
          disabled={disabled || option.disabled}
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
}

const RadioItem: React.FC<RadioItemProps> = ({
  option,
  selected,
  onSelect,
  disabled = false,
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
    <AppTouchable
      style={styles.item}
      onPress={() => {
        void haptics.light();
        onSelect();
      }}
      disabled={disabled}
      activeOpacity={0.8}
      hitSlop={OPERATIONAL_HIT_SLOP.standard}
      accessibilityRole="radio"
      accessibilityLabel={option.label}
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
    </AppTouchable>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: touchTargets.minimum,
    paddingVertical: spacing.xs,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: semanticColors.input.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
    marginTop: 2,
    backgroundColor: semanticColors.input.background,
  },
  radioSelected: {
    borderColor: semanticColors.button.primary,
  },
  radioDisabled: {
    borderColor: colors.neutral[300],
    backgroundColor: colors.neutral[100],
  },
  radioDisabledSelected: {
    borderColor: colors.neutral[400],
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "transparent",
  },
  radioInnerSelected: {
    backgroundColor: semanticColors.button.primary,
  },
  radioInnerDisabledSelected: {
    backgroundColor: colors.neutral[500],
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
