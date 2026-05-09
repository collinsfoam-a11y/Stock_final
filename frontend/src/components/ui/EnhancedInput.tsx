/**
 * EnhancedInput - Material Design Inspired Input Component
 *
 * Features:
 * - Floating label positions (container, border, box)
 * - Error/success states with messages
 * - Left and right icons
 * - Password visibility toggle
 * - Character counter
 * - Animated focus states
 *
 * Inspired by react-native-design-kit Input patterns
 */

import React, { useState, useRef, useCallback } from "react";
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TextStyle,
  TextInputProps,
  StyleProp,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from "react-native-reanimated";
import { useThemeContext } from "@/context/ThemeContext";
import {
  ComponentSizes,
  BorderRadius,
  FontSizes,
  FontWeights,
  Spacing,
  AnimationTimings,
} from "@/theme/uiConstants";

import { colors as uiColors, semanticColors as uiSemanticColors } from "@/theme/legacyCompat";
/**
 * Shared size options for the enhanced text input.
 */
export type InputSize = "sm" | "md" | "lg";

/**
 * Supported label layouts for the enhanced text input.
 */
export type LabelPosition = "floating" | "fixed" | "none";

/**
 * Props for the themed enhanced text input component.
 */
export interface EnhancedInputProps extends Omit<TextInputProps, "style"> {
  /** Input label */
  label?: string;
  /** Label behavior */
  labelPosition?: LabelPosition;
  /** Helper text below input */
  helperText?: string;
  /** Error message (shows error state) */
  error?: string;
  /** Success state */
  success?: boolean;
  /** Success message */
  successMessage?: string;
  /** Left icon */
  leftIcon?: keyof typeof Ionicons.glyphMap;
  /** Right icon */
  rightIcon?: keyof typeof Ionicons.glyphMap;
  /** Right icon press handler */
  onRightIconPress?: () => void;
  /** Input size */
  size?: InputSize;
  /** Show character counter */
  showCounter?: boolean;
  /** Maximum characters */
  maxLength?: number;
  /** Container style */
  containerStyle?: StyleProp<ViewStyle>;
  /** Input style */
  inputStyle?: StyleProp<TextStyle>;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Full width */
  fullWidth?: boolean;
}

const AnimatedText = Animated.createAnimatedComponent(Text);
const SIZE_CONFIG: Record<
  InputSize,
  { height: number; fontSize: number; iconSize: number; paddingHorizontal: number }
> = {
  sm: {
    height: ComponentSizes.input.sm,
    fontSize: FontSizes.sm,
    iconSize: ComponentSizes.icon.sm,
    paddingHorizontal: Spacing.md,
  },
  md: {
    height: ComponentSizes.input.md,
    fontSize: FontSizes.md,
    iconSize: ComponentSizes.icon.md,
    paddingHorizontal: Spacing.base,
  },
  lg: {
    height: ComponentSizes.input.lg,
    fontSize: FontSizes.lg,
    iconSize: ComponentSizes.icon.lg,
    paddingHorizontal: Spacing.lg,
  },
};

const resolveBorderColor = (
  error: string | undefined,
  success: boolean | undefined,
  isFocused: boolean,
  themeLegacy: any
) => {
  if (error) return themeLegacy.colors.error || uiColors.error[600];
  if (success) return themeLegacy.colors.success || uiColors.success[600];
  if (isFocused) return themeLegacy.colors.primary;
  return themeLegacy.colors.border || "rgba(0, 0, 0, 0.1)";
};

const resolveIconColor = (
  error: string | undefined,
  success: boolean | undefined,
  isFocused: boolean,
  themeLegacy: any
) => {
  if (error) return themeLegacy.colors.error || uiColors.error[600];
  if (success) return themeLegacy.colors.success || uiColors.success[600];
  if (isFocused) return themeLegacy.colors.primary;
  return themeLegacy.colors.textSecondary || uiSemanticColors.text.tertiary;
};

const getHelperMessage = (
  error: string | undefined,
  success: boolean | undefined,
  successMessage: string | undefined,
  helperText: string | undefined
) => {
  if (error) {
    return { text: error, colorKey: "error" as const };
  }
  if (success && successMessage) {
    return { text: successMessage, colorKey: "success" as const };
  }
  if (helperText) {
    return { text: helperText, colorKey: "textSecondary" as const };
  }
  return null;
};

const resolveFloatingLabelColor = (
  error: string | undefined,
  isFocused: boolean,
  themeLegacy: any
) => {
  if (error) return themeLegacy.colors.error;
  if (isFocused) return themeLegacy.colors.primary;
  return themeLegacy.colors.textSecondary;
};

const resolveRightIconName = (
  isPassword: boolean,
  isPasswordVisible: boolean,
  rightIcon?: keyof typeof Ionicons.glyphMap
) => {
  if (isPassword) {
    return isPasswordVisible ? ("eye-off" as const) : ("eye" as const);
  }
  return rightIcon;
};

const resolveFixedLabel = (labelPosition: LabelPosition, label?: string) =>
  labelPosition === "fixed" ? label : undefined;

const resolveContainerBackground = (disabled: boolean, backgroundColor: string) =>
  disabled ? "rgba(0, 0, 0, 0.05)" : backgroundColor;

const resolveRightActionHandler = (
  isPassword: boolean,
  togglePasswordVisibility: () => void,
  onRightIconPress?: () => void
) => (isPassword ? togglePasswordVisibility : onRightIconPress);

const buildInputStyles = (
  config: { fontSize: number },
  textColor: string,
  hasLeftIcon: boolean,
  hasRightAction: boolean,
  inputStyle?: StyleProp<TextStyle>
) => {
  const resolvedStyles: StyleProp<TextStyle>[] = [
    styles.input,
    { fontSize: config.fontSize, color: textColor },
  ];
  if (hasLeftIcon) {
    resolvedStyles.push(styles.inputWithLeftIcon);
  }
  if (hasRightAction) {
    resolvedStyles.push(styles.inputWithRightIcon);
  }
  if (inputStyle) {
    resolvedStyles.push(inputStyle);
  }
  return resolvedStyles;
};

const FixedLabel = ({ label, color }: { label?: string; color: string }) => {
  if (!label) return null;
  return <Text style={[styles.fixedLabel, { color }]}>{label}</Text>;
};

const FloatingLabel = ({
  label,
  visible,
  color,
  backgroundColor,
  animatedStyle,
}: {
  label?: string;
  visible: boolean;
  color: string;
  backgroundColor: string;
  animatedStyle: any;
}) => {
  if (!label || !visible) return null;
  return (
    <AnimatedText style={[styles.floatingLabel, { color, backgroundColor }, animatedStyle]}>
      {label}
    </AnimatedText>
  );
};

const RightAction = ({
  visible,
  iconName,
  iconSize,
  iconColor,
  onPress,
}: {
  visible: boolean;
  iconName: keyof typeof Ionicons.glyphMap;
  iconSize: number;
  iconColor: string;
  onPress?: () => void;
}) => {
  if (!visible) return null;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.rightIcon}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Ionicons name={iconName} size={iconSize} color={iconColor} />
    </TouchableOpacity>
  );
};

const HelperRow = ({
  helper,
  showCounter,
  charCount,
  maxLength,
  themeLegacy,
}: {
  helper: { text: string; colorKey: "error" | "success" | "textSecondary" } | null;
  showCounter: boolean;
  charCount: number;
  maxLength?: number;
  themeLegacy: any;
}) => (
  <View style={styles.bottomRow}>
    <View style={styles.helperContainer}>
      {helper ? (
        <Text style={[styles.helperText, { color: themeLegacy.colors[helper.colorKey] }]}>
          {helper.text}
        </Text>
      ) : null}
    </View>

    {showCounter && maxLength ? (
      <Text
        style={[
          styles.counter,
          { color: themeLegacy.colors.textSecondary },
          charCount >= maxLength && { color: themeLegacy.colors.error },
        ]}
      >
        {charCount}/{maxLength}
      </Text>
    ) : null}
  </View>
);

/**
 * EnhancedInput - Beautiful text input with animations
 *
 * @example
 * // Basic usage
 * <EnhancedInput
 *   label="Email"
 *   placeholder="Enter your email"
 *   keyboardType="email-address"
 * />
 *
 * @example
 * // With error state
 * <EnhancedInput
 *   label="Password"
 *   secureTextEntry
 *   error="Password must be at least 8 characters"
 * />
 *
 * @example
 * // With icons
 * <EnhancedInput
 *   label="Search"
 *   leftIcon="search"
 *   rightIcon="close-circle"
 *   onRightIconPress={() => setValue('')}
 * />
 */
/**
 * Renders a themed text input with validation, icons, and animated labels.
 */
export const EnhancedInput: React.FC<EnhancedInputProps> = ({
  label,
  labelPosition = "floating",
  helperText,
  error,
  success,
  successMessage,
  leftIcon,
  rightIcon,
  onRightIconPress,
  size = "md",
  showCounter = false,
  maxLength,
  containerStyle,
  inputStyle,
  disabled = false,
  fullWidth = false,
  value,
  onFocus,
  onBlur,
  secureTextEntry,
  ...rest
}) => {
  const { themeLegacy } = useThemeContext();
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const focusProgress = useSharedValue(0);

  const shouldFloat = isFocused || (value?.length ?? 0) > 0;
  const config = SIZE_CONFIG[size];
  const borderColor = resolveBorderColor(error, success, isFocused, themeLegacy);
  const iconColor = resolveIconColor(error, success, isFocused, themeLegacy);
  const helper = getHelperMessage(error, success, successMessage, helperText);
  const backgroundColor = themeLegacy.colors.surface || themeLegacy.colors.background;
  const isPassword = Boolean(secureTextEntry);
  const showRightAction = Boolean(rightIcon || isPassword);
  const rightIconName = resolveRightIconName(isPassword, isPasswordVisible, rightIcon);
  const finalSecureEntry = isPassword && !isPasswordVisible;
  const charCount = value?.length || 0;
  const showCounterText = Boolean(showCounter && maxLength);
  const fixedLabel = resolveFixedLabel(labelPosition, label);
  const fixedLabelColor = error ? themeLegacy.colors.error : themeLegacy.colors.text;
  const floatingLabelColor = resolveFloatingLabelColor(error, isFocused, themeLegacy);
  const containerBackground = resolveContainerBackground(disabled, backgroundColor);
  const inputStyles = buildInputStyles(
    config,
    themeLegacy.colors.text,
    Boolean(leftIcon),
    showRightAction,
    inputStyle
  );

  // Handlers
  const handleFocus = useCallback(
    (e: any) => {
      setIsFocused(true);
      focusProgress.value = withTiming(1, { duration: AnimationTimings.fast });
      onFocus?.(e);
    },
    [onFocus, focusProgress]
  );

  const handleBlur = useCallback(
    (e: any) => {
      setIsFocused(false);
      focusProgress.value = withTiming(0, { duration: AnimationTimings.fast });
      onBlur?.(e);
    },
    [onBlur, focusProgress]
  );

  const togglePasswordVisibility = useCallback(() => {
    setIsPasswordVisible((prev) => !prev);
  }, []);
  const rightActionPress = resolveRightActionHandler(
    isPassword,
    togglePasswordVisibility,
    onRightIconPress
  );

  // Animated label style
  const labelAnimatedStyle = useAnimatedStyle(() => {
    if (labelPosition !== "floating") return {};

    const translateY = interpolate(
      shouldFloat ? 1 : focusProgress.value,
      [0, 1],
      [0, -(config.height / 2 + 4)]
    );
    const scale = interpolate(shouldFloat ? 1 : focusProgress.value, [0, 1], [1, 0.85]);

    return {
      transform: [{ translateY }, { scale }],
    };
  });

  return (
    <View style={[styles.container, fullWidth ? styles.fullWidth : undefined, containerStyle]}>
      <FixedLabel label={fixedLabel} color={fixedLabelColor} />

      <View
        style={[
          styles.inputContainer,
          {
            minHeight: config.height,
            paddingHorizontal: config.paddingHorizontal,
            borderColor,
            backgroundColor: containerBackground,
          },
        ]}
      >
        <FloatingLabel
          label={label}
          visible={labelPosition === "floating"}
          color={floatingLabelColor}
          backgroundColor={backgroundColor}
          animatedStyle={labelAnimatedStyle}
        />

        {leftIcon && (
          <Ionicons
            name={leftIcon}
            size={config.iconSize}
            color={iconColor}
            style={styles.leftIcon}
          />
        )}

        <TextInput
          ref={inputRef}
          style={inputStyles}
          placeholderTextColor={themeLegacy.colors.textSecondary || uiSemanticColors.text.tertiary}
          editable={!disabled}
          value={value}
          onFocus={handleFocus}
          onBlur={handleBlur}
          secureTextEntry={finalSecureEntry}
          maxLength={maxLength}
          autoCapitalize="none"
          autoCorrect={false}
          {...rest}
        />

        <RightAction
          visible={showRightAction}
          iconName={rightIconName as keyof typeof Ionicons.glyphMap}
          iconSize={config.iconSize}
          iconColor={iconColor}
          onPress={rightActionPress}
        />
      </View>

      <HelperRow
        helper={helper}
        showCounter={showCounterText}
        charCount={charCount}
        maxLength={maxLength}
        themeLegacy={themeLegacy}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  fullWidth: {
    width: "100%",
  },
  fixedLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    marginBottom: Spacing.xs,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    position: "relative",
  },
  floatingLabel: {
    position: "absolute",
    left: Spacing.md,
    fontSize: FontSizes.md,
    paddingHorizontal: Spacing.xs,
  },
  leftIcon: {
    marginRight: Spacing.sm,
  },
  rightIcon: {
    marginLeft: Spacing.sm,
    padding: Spacing.xs,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.md,
  },
  inputWithLeftIcon: {
    paddingLeft: 0,
  },
  inputWithRightIcon: {
    paddingRight: 0,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  helperContainer: {
    flex: 1,
  },
  helperText: {
    fontSize: FontSizes.xs,
  },
  counter: {
    fontSize: FontSizes.xs,
    marginLeft: Spacing.sm,
  },
});

export default EnhancedInput;
