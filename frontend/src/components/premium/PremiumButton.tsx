/**
 * PremiumButton Component
 *
 * @deprecated Use AppButton. This file is a wrapper-only migration facade.
 */

import React from "react";
import { ViewStyle, TextStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppButton, type AppButtonVariant } from "../ui/AppButton";
import type { ButtonVariant, ButtonSize } from "../ui/ModernButton";
import { warnDeprecatedVisualSystem } from "../ui/legacyVisualSystem";

interface PremiumButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  gradientColors?: string[];
  testID?: string;
  accessibilityLabel?: string;
}

export const PremiumButton: React.FC<PremiumButtonProps> = (props) => {
  warnDeprecatedVisualSystem("PremiumButton");
  const { variant, gradientColors: _gradientColors, ...rest } = props;
  const mappedVariant: AppButtonVariant =
    variant === "danger"
      ? "destructive"
      : variant === "ghost" || variant === "outline"
        ? "tertiary"
        : variant === "secondary"
          ? "secondary"
          : "primary";

  return <AppButton {...rest} variant={mappedVariant} />;
};

export type { PremiumButtonProps, ButtonVariant, ButtonSize };
