/**
 * ModernButton
 *
 * Compatibility wrapper around the shared themed button primitive.
 */

import React from "react";
import { StyleProp, TextStyle, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useThemeContextSafe } from "../../context/ThemeContext";
import {
  EnhancedButton,
  type ButtonType as EnhancedButtonType,
  type ButtonSize as EnhancedButtonSize,
} from "./EnhancedButton";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "glass"
  | "gradient";
export type ButtonSize = "small" | "medium" | "large";

interface ModernButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  gradientColors?: string[];
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const mapVariant = (variant: ButtonVariant): EnhancedButtonType => {
  if (variant === "outline" || variant === "glass") return "outline";
  if (variant === "ghost") return "text";
  if (variant === "gradient") return "gradient";
  return "solid";
};

const mapSize = (size: ButtonSize): EnhancedButtonSize => {
  if (size === "small") return "sm";
  if (size === "large") return "lg";
  return "md";
};

export const ModernButton: React.FC<ModernButtonProps> = ({
  title,
  onPress,
  variant = "primary",
  size = "medium",
  disabled = false,
  loading = false,
  icon,
  iconPosition = "left",
  fullWidth = false,
  style,
  textStyle,
  gradientColors,
  testID,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const themeContext = useThemeContextSafe();
  const theme = themeContext?.theme;
  const themeLegacy = themeContext?.themeLegacy;

  const primaryColor = theme?.colors.primary?.[500] ?? themeLegacy?.colors.primary ?? "#0969DA";
  const secondaryColor =
    theme?.colors.secondary?.[500] ?? themeLegacy?.colors.info ?? "#2DA44E";
  const dangerColor = themeLegacy?.colors.danger ?? themeLegacy?.colors.error ?? "#D1242F";
  const borderColor = theme?.colors.border?.medium ?? themeLegacy?.colors.border ?? "#D0D7DE";
  const surfaceColor =
    theme?.colors.background.elevated ?? themeLegacy?.colors.surfaceElevated ?? "#FFFFFF";
  const textColor = theme?.colors.text.primary ?? themeLegacy?.colors.text ?? "#0D1117";
  const accentColor = theme?.colors.accent ?? themeLegacy?.colors.accent ?? primaryColor;

  let color = primaryColor;
  if (variant === "secondary") {
    color = secondaryColor;
  } else if (variant === "danger") {
    color = dangerColor;
  } else if (variant === "glass") {
    color = borderColor;
  } else if (variant === "outline" || variant === "ghost") {
    color = accentColor;
  }

  const resolvedTextColor =
    variant === "glass"
      ? textColor
      : variant === "outline" || variant === "ghost"
        ? color
        : "#FFFFFF";

  const resolvedGradientColors: readonly [string, string, ...string[]] =
    gradientColors?.length && gradientColors.length >= 2
      ? [gradientColors[0]!, gradientColors[1]!, ...gradientColors.slice(2)]
      : [primaryColor, theme?.colors.accent ?? accentColor];

  const compatibilityStyle =
    variant === "glass"
      ? {
          backgroundColor: surfaceColor,
          borderColor,
          borderWidth: 1,
        }
      : undefined;

  return (
    <EnhancedButton
      title={title}
      onPress={onPress}
      type={mapVariant(variant)}
      size={mapSize(size)}
      disabled={disabled}
      loading={loading}
      icon={icon}
      iconPosition={iconPosition}
      fullWidth={fullWidth}
      color={color}
      textColor={resolvedTextColor}
      gradientColors={resolvedGradientColors}
      raised={variant === "primary" || variant === "secondary" || variant === "danger"}
      style={[compatibilityStyle, style]}
      textStyle={textStyle}
      testID={testID}
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
    />
  );
};

export default ModernButton;
