import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import { OperationalBackground } from "./OperationalSurface";

export type AuroraVariant = "primary" | "secondary" | "success" | "warm" | "dark";

interface AuroraBackgroundProps {
  variant?: AuroraVariant;
  intensity?: "low" | "medium" | "high";
  animated?: boolean;
  withParticles?: boolean;
  particleCount?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Compatibility wrapper for older Aurora screens.
 *
 * Decorative animated gradients are intentionally suppressed for operational
 * screens; callers keep working while receiving a stable utility background.
 */
export const AuroraBackground: React.FC<AuroraBackgroundProps> = ({ style, children }) => (
  <OperationalBackground style={style}>{children}</OperationalBackground>
);
