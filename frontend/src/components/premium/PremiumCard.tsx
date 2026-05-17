/**
 * PremiumCard Component
 *
 * @deprecated Use AppCard. This file is a wrapper-only migration facade.
 */

import React from "react";
import { ViewStyle, StyleProp } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppCard, type AppCardVariant } from "../ui/AppCard";
import type { CardVariant, CardElevation } from "../ui/ModernCard";
import { warnDeprecatedVisualSystem } from "../ui/legacyVisualSystem";

interface PremiumCardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  onPress?: () => void;
  variant?: CardVariant;
  elevation?: CardElevation;
  padding?: number;
  style?: StyleProp<ViewStyle>;
  gradientColors?: string[];
  icon?: keyof typeof Ionicons.glyphMap;
  footer?: React.ReactNode;
  testID?: string;
  onLongPress?: () => void;
  delayLongPress?: number;
}

export const PremiumCard: React.FC<PremiumCardProps> = (props) => {
  warnDeprecatedVisualSystem("PremiumCard");
  const { variant, gradientColors: _gradientColors, ...rest } = props;
  const mappedVariant: AppCardVariant =
    variant === "outlined" ? "outlined" : variant === "elevated" ? "elevated" : "default";

  return <AppCard {...rest} variant={mappedVariant} />;
};

export type { PremiumCardProps, CardVariant, CardElevation };
