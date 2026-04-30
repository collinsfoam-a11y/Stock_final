import React from "react";
import {
  ActivityIndicator,
  KeyboardTypeOptions,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  semanticColors,
  shadows,
  spacing,
  radius,
  fontSize,
  fontWeight,
  touchTargets,
} from "../../theme/unified";

export type OperationalSurfaceVariant =
  | "default"
  | "subtle"
  | "selected"
  | "success"
  | "warning"
  | "danger"
  | "light"
  | "medium"
  | "strong"
  | "dark"
  | "modal";

export type OperationalElevation = "none" | "xs" | "sm" | "md" | "lg" | "xl";

export interface OperationalCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: OperationalSurfaceVariant;
  borderRadius?: number;
  padding?: number;
  elevation?: OperationalElevation;
  intensity?: number;
  tint?: "light" | "dark" | "default";
  withGradientBorder?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export interface OperationalBackgroundProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: string;
  intensity?: string;
  animated?: boolean;
  withParticles?: boolean;
  particleCount?: number;
}

export interface OperationalButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost" | string;
  size?: "small" | "medium" | "large" | string;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export interface OperationalInputProps {
  label?: string;
  value: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  editable?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  testID?: string;
  maxLength?: number;
  required?: boolean;
  onBlur?: () => void;
  onSubmitEditing?: () => void;
  returnKeyType?: "done" | "go" | "next" | "search" | "send";
}

const variantStyle: Record<OperationalSurfaceVariant, ViewStyle> = {
  default: {
    backgroundColor: semanticColors.card.background,
    borderColor: semanticColors.card.border,
  },
  subtle: {
    backgroundColor: semanticColors.background.secondary,
    borderColor: semanticColors.border.subtle,
  },
  selected: {
    backgroundColor: semanticColors.background.elevated,
    borderColor: semanticColors.border.focus,
  },
  success: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  warning: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  danger: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  light: {
    backgroundColor: semanticColors.card.background,
    borderColor: semanticColors.card.border,
  },
  medium: {
    backgroundColor: semanticColors.card.background,
    borderColor: semanticColors.card.border,
  },
  strong: {
    backgroundColor: semanticColors.card.background,
    borderColor: semanticColors.border.strong,
  },
  dark: {
    backgroundColor: semanticColors.background.secondary,
    borderColor: semanticColors.border.subtle,
  },
  modal: {
    backgroundColor: semanticColors.background.elevated,
    borderColor: semanticColors.border.default,
  },
};

const elevationStyle: Record<OperationalElevation, ViewStyle> = {
  none: {},
  xs: shadows.xs,
  sm: shadows.sm,
  md: shadows.sm,
  lg: shadows.md,
  xl: shadows.md,
};

export const OperationalCard = ({
  children,
  style,
  variant = "default",
  borderRadius,
  padding,
  elevation = "xs",
  accessibilityLabel,
  accessibilityHint,
}: OperationalCardProps) => (
  <View
    style={[
      styles.card,
      variantStyle[variant] ?? variantStyle.default,
      elevationStyle[elevation] ?? elevationStyle.xs,
      {
        borderRadius: borderRadius ?? radius.md,
        padding: padding ?? spacing.lg,
      },
      style,
    ]}
    accessible={true}
    accessibilityLabel={accessibilityLabel}
    accessibilityHint={accessibilityHint}
  >
    {children}
  </View>
);

export const OperationalBackground = ({ children, style }: OperationalBackgroundProps) => (
  <View style={[styles.background, style]}>{children}</View>
);

export const OperationalButton = ({
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
  testID,
  accessibilityLabel,
}: OperationalButtonProps) => {
  const isSecondary = variant === "secondary" || variant === "ghost";
  const isDanger = variant === "danger" || variant === "destructive";
  const contentColor = isSecondary ? semanticColors.text.primary : semanticColors.text.inverse;
  const minHeight = size === "large" ? 52 : touchTargets.minimum;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight,
          backgroundColor: isDanger
            ? semanticColors.status.error
            : isSecondary
              ? semanticColors.button.secondary
              : semanticColors.button.primary,
          borderColor: isSecondary ? semanticColors.border.default : "transparent",
          opacity: disabled ? 0.55 : pressed ? 0.82 : 1,
          width: fullWidth ? "100%" : undefined,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={contentColor} />
      ) : (
        <>
          {icon && iconPosition === "left" && (
            <Ionicons name={icon} size={18} color={contentColor} />
          )}
          <Text style={[styles.buttonText, { color: contentColor }, textStyle]}>{title}</Text>
          {icon && iconPosition === "right" && (
            <Ionicons name={icon} size={18} color={contentColor} />
          )}
        </>
      )}
    </Pressable>
  );
};

export const OperationalInput = ({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  helperText,
  disabled = false,
  editable = true,
  multiline = false,
  numberOfLines = 1,
  secureTextEntry = false,
  keyboardType = "default",
  autoCapitalize = "none",
  autoCorrect = false,
  leftIcon,
  rightIcon,
  onRightIconPress,
  style,
  inputStyle,
  testID,
  maxLength,
  required = false,
  onBlur,
  onSubmitEditing,
  returnKeyType,
}: OperationalInputProps) => {
  const isDisabled = disabled || editable === false;

  return (
    <View style={[styles.inputGroup, style]}>
      {label && (
        <Text style={[styles.inputLabel, error && styles.inputLabelError]}>
          {label}
          {required ? " *" : ""}
        </Text>
      )}
      <View
        style={[
          styles.inputShell,
          multiline && styles.inputShellMultiline,
          error && styles.inputShellError,
          isDisabled && styles.inputShellDisabled,
        ]}
      >
        {leftIcon && <Ionicons name={leftIcon} size={18} color={semanticColors.text.tertiary} />}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={semanticColors.text.tertiary}
          editable={!isDisabled}
          multiline={multiline}
          numberOfLines={numberOfLines}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          maxLength={maxLength}
          onBlur={onBlur}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          testID={testID}
          style={[styles.input, multiline && styles.inputMultiline, inputStyle]}
        />
        {rightIcon && (
          <Pressable
            onPress={onRightIconPress}
            accessibilityRole="button"
            accessibilityLabel="Input action"
            hitSlop={8}
            style={styles.inputIconButton}
          >
            <Ionicons name={rightIcon} size={18} color={semanticColors.text.tertiary} />
          </Pressable>
        )}
      </View>
      {(error || helperText) && (
        <Text style={[styles.inputHelp, error && styles.inputHelpError]}>
          {error || helperText}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: semanticColors.background.primary,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  button: {
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  buttonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semiBold,
  },
  inputGroup: {
    gap: spacing.xs,
  },
  inputLabel: {
    color: semanticColors.text.secondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  inputLabelError: {
    color: semanticColors.status.error,
  },
  inputShell: {
    alignItems: "center",
    backgroundColor: semanticColors.input.background,
    borderColor: semanticColors.input.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: touchTargets.comfortable,
    paddingHorizontal: spacing.md,
  },
  inputShellMultiline: {
    alignItems: "flex-start",
    minHeight: 88,
    paddingVertical: spacing.sm,
  },
  inputShellError: {
    borderColor: semanticColors.status.error,
  },
  inputShellDisabled: {
    backgroundColor: semanticColors.background.tertiary,
    opacity: 0.65,
  },
  input: {
    color: semanticColors.input.text,
    flex: 1,
    fontSize: fontSize.md,
    minHeight: touchTargets.minimum,
    paddingVertical: 0,
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  inputIconButton: {
    alignItems: "center",
    minHeight: touchTargets.minimum,
    minWidth: touchTargets.minimum,
    justifyContent: "center",
  },
  inputHelp: {
    color: semanticColors.text.tertiary,
    fontSize: fontSize.xs,
  },
  inputHelpError: {
    color: semanticColors.status.error,
  },
});
