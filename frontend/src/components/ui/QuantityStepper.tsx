import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useThemeContext } from "../../context/ThemeContext";
import { haptics } from "../../services/haptics";
import { getDecorativeIconProps } from "../../utils/accessibility";

interface Props {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  testID?: string;
}

export function QuantityStepper({ value, onChange, min = 0, max, disabled, testID }: Props) {
  const { themeLegacy: theme } = useThemeContext();

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

  const buttonStyle = {
    backgroundColor: theme.colors.surfaceElevated,
    borderColor: theme.colors.border,
  };

  return (
    <View style={[styles.container, disabled && { opacity: 0.6 }]} testID={testID}>
      <TouchableOpacity
        onPress={() => handleChange(-1)}
        disabled={disabled || value <= min}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={[styles.button, buttonStyle, (disabled || value <= min) && styles.buttonDisabled]}
        accessibilityLabel="decrement"
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || value <= min }}
      >
        <Ionicons {...getDecorativeIconProps()} name="remove" size={20} color={theme.colors.text} />
      </TouchableOpacity>

      <View
        style={[
          styles.valueBox,
          {
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <Text style={[styles.valueText, { color: theme.colors.text }]}>{value}</Text>
      </View>

      <TouchableOpacity
        onPress={() => handleChange(1)}
        disabled={disabled || (typeof max === "number" && value >= max)}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={[
          styles.button,
          buttonStyle,
          (disabled || (typeof max === "number" && value >= max)) && styles.buttonDisabled,
        ]}
        accessibilityLabel="increment"
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || (typeof max === "number" && value >= max) }}
      >
        <Ionicons {...getDecorativeIconProps()} name="add" size={20} color={theme.colors.text} />
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
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  valueBox: {
    minWidth: 56,
    marginHorizontal: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  valueText: {
    fontSize: 18,
    fontWeight: "700",
  },
});

export default QuantityStepper;
