/**
 * @deprecated Use AppButton for new work.
 *
 * RippleButton remains as a compatibility facade for legacy imports. It no longer
 * owns a visual system, gradient language, or custom ripple implementation.
 */

import React, { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { getMinimumTouchTargetStyle } from "@/utils/accessibility";
import { AnimatedPressable } from "./AnimatedPressable";
import { warnDeprecatedVisualSystem } from "./legacyVisualSystem";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "error"
  | "ghost"
  | "outline";
type ButtonSize = "sm" | "md" | "lg" | "xl";

interface RippleButtonProps {
  children?: React.ReactNode;
  label?: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: "left" | "right";
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  hapticFeedback?: "light" | "medium" | "heavy" | "none";
}

type RippleTokens = ReturnType<typeof useUiTokens>;

function getSizeConfig(uiTokens: RippleTokens, size: ButtonSize) {
  const configs = {
    sm: {
      paddingVertical: uiTokens.spacing.sm,
      paddingHorizontal: uiTokens.spacing.md,
      fontSize: 14,
      iconSize: 16,
      borderRadius: uiTokens.radius.md,
      minHeight: 44,
    },
    md: {
      paddingVertical: uiTokens.spacing.md,
      paddingHorizontal: uiTokens.spacing.lg,
      fontSize: 16,
      iconSize: 20,
      borderRadius: uiTokens.radius.lg,
      minHeight: 48,
    },
    lg: {
      paddingVertical: uiTokens.spacing.lg,
      paddingHorizontal: uiTokens.spacing.xl,
      fontSize: 18,
      iconSize: 24,
      borderRadius: uiTokens.radius.xl,
      minHeight: 52,
    },
    xl: {
      paddingVertical: uiTokens.spacing.xl,
      paddingHorizontal: uiTokens.spacing["2xl"],
      fontSize: 20,
      iconSize: 28,
      borderRadius: uiTokens.radius.xl,
      minHeight: 56,
    },
  };

  return configs[size];
}

function getVariantConfig(uiTokens: RippleTokens, variant: ButtonVariant) {
  const configs = {
    primary: {
      backgroundColor: uiTokens.colors.accent,
      borderColor: uiTokens.colors.accent,
      textColor: uiTokens.colors.surface,
    },
    secondary: {
      backgroundColor: colorWithAlpha(uiTokens.colors.accent, 0.1),
      borderColor: colorWithAlpha(uiTokens.colors.accent, 0.24),
      textColor: uiTokens.colors.accent,
    },
    success: {
      backgroundColor: colorWithAlpha(uiTokens.colors.success, 0.12),
      borderColor: colorWithAlpha(uiTokens.colors.success, 0.3),
      textColor: uiTokens.colors.success,
    },
    warning: {
      backgroundColor: colorWithAlpha(uiTokens.colors.warning, 0.12),
      borderColor: colorWithAlpha(uiTokens.colors.warning, 0.3),
      textColor: uiTokens.colors.warning,
    },
    error: {
      backgroundColor: uiTokens.colors.error,
      borderColor: uiTokens.colors.error,
      textColor: uiTokens.colors.surface,
    },
    ghost: {
      backgroundColor: "transparent",
      borderColor: "transparent",
      textColor: uiTokens.colors.accent,
    },
    outline: {
      backgroundColor: "transparent",
      borderColor: uiTokens.colors.border,
      textColor: uiTokens.colors.textPrimary,
    },
  };

  return configs[variant];
}

export const RippleButton: React.FC<RippleButtonProps> = ({
  children,
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "left",
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  textStyle,
  hapticFeedback = "medium",
}) => {
  warnDeprecatedVisualSystem("RippleButton");
  const uiTokens = useUiTokens();
  const styles = useMemo(() => createStyles(uiTokens), [uiTokens]);
  const variantConfig = getVariantConfig(uiTokens, variant);
  const sizeConfig = getSizeConfig(uiTokens, size);
  const contentLabel = label ?? (typeof children === "string" ? children : "Action");
  const isDisabled = disabled || loading;

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={isDisabled}
      hapticFeedback={hapticFeedback}
      accessibilityLabel={contentLabel}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        styles.button,
        getMinimumTouchTargetStyle(sizeConfig.minHeight),
        {
          paddingVertical: sizeConfig.paddingVertical,
          paddingHorizontal: sizeConfig.paddingHorizontal,
          borderRadius: sizeConfig.borderRadius,
          backgroundColor: variantConfig.backgroundColor,
          borderColor: variantConfig.borderColor,
          opacity: isDisabled ? 0.55 : 1,
        },
        fullWidth ? styles.fullWidth : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variantConfig.textColor} />
      ) : (
        <View style={styles.contentContainer}>
          {icon && iconPosition === "left" && (
            <Ionicons
              name={icon}
              size={sizeConfig.iconSize}
              color={variantConfig.textColor}
              style={styles.iconLeft}
            />
          )}
          {(label || children) && (
            <Text
              style={[
                styles.label,
                {
                  fontSize: sizeConfig.fontSize,
                  color: variantConfig.textColor,
                },
                textStyle,
              ]}
            >
              {label || children}
            </Text>
          )}
          {icon && iconPosition === "right" && (
            <Ionicons
              name={icon}
              size={sizeConfig.iconSize}
              color={variantConfig.textColor}
              style={styles.iconRight}
            />
          )}
        </View>
      )}
    </AnimatedPressable>
  );
};

const createStyles = (uiTokens: RippleTokens) =>
  StyleSheet.create({
    button: {
      overflow: "hidden",
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
    },
    fullWidth: {
      width: "100%",
    },
    contentContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    label: {
      fontWeight: "600",
      textAlign: "center",
    },
    iconLeft: {
      marginRight: uiTokens.spacing.sm,
    },
    iconRight: {
      marginLeft: uiTokens.spacing.sm,
    },
  });

export default RippleButton;
