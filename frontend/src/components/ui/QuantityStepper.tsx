import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useUiTokens } from "@/hooks/useUiTokens";
import { haptics } from "@/services/haptics";
import { getDecorativeIconProps, getAccessibleButtonProps } from "@/utils/accessibility";

interface Props {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  testID?: string;
}

export function QuantityStepper({ value, onChange, min = 0, max, disabled, testID }: Props) {
  const uiTokens = useUiTokens();

  const clamp = (n: number) => {
    const lower = Math.max(min, isFinite(min) ? min : 0);
    const upper = typeof max === "number" ? max : Number.POSITIVE_INFINITY;
    return Math.min(Math.max(n, lower), upper);
  };

  const handleChange = (delta: number) => {
    const next = clamp(value + delta);
    if (next !== value) {
      void haptics.light();
      onChange(next);
    }
  };

  const isDecrementDisabled = disabled || value <= min;
  const isIncrementDisabled = disabled || (typeof max === "number" && value >= max);

  const buttonStyle = {
    backgroundColor: uiTokens.colors.surfaceElevated,
    borderColor: uiTokens.colors.border,
    width: 44, // Minimum touch target per AGENT_UI_UX_RULES.md
    height: 44,
    borderRadius: uiTokens.radius.sm,
  };

  const valueBoxStyle = {
    borderColor: uiTokens.colors.border,
    backgroundColor: uiTokens.colors.surface,
    marginHorizontal: uiTokens.spacing.sm,
    borderRadius: uiTokens.radius.sm,
  };

  return (
    <View style={[styles.container, disabled && { opacity: 0.6 }]} testID={testID}>
      <TouchableOpacity
        onPress={() => handleChange(-1)}
        disabled={isDecrementDisabled}
        style={[styles.button, buttonStyle, isDecrementDisabled && styles.buttonDisabled]}
        {...getAccessibleButtonProps({
          label: "Decrease quantity",
          disabled: isDecrementDisabled,
        })}
      >
        <Ionicons
          {...getDecorativeIconProps()}
          name="remove"
          size={20}
          color={isDecrementDisabled ? uiTokens.colors.textMuted : uiTokens.colors.textPrimary}
        />
      </TouchableOpacity>

      <View style={[styles.valueBox, valueBoxStyle]}>
        <Text style={[styles.valueText, { color: uiTokens.colors.textPrimary }]}>{value}</Text>
      </View>

      <TouchableOpacity
        onPress={() => handleChange(1)}
        disabled={isIncrementDisabled}
        style={[styles.button, buttonStyle, isIncrementDisabled && styles.buttonDisabled]}
        {...getAccessibleButtonProps({
          label: "Increase quantity",
          disabled: isIncrementDisabled,
        })}
      >
        <Ionicons
          {...getDecorativeIconProps()}
          name="add"
          size={20}
          color={isIncrementDisabled ? uiTokens.colors.textMuted : uiTokens.colors.textPrimary}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  button: {
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  valueBox: {
    minWidth: 56,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  valueText: {
    fontSize: 18,
    fontWeight: "700",
  },
});

export default QuantityStepper;
