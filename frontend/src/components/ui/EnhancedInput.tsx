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
import {
  colors,
  semanticColors,
  spacing,
  radius,
  fontSize,
  textStyles,
  touchTargets,
  hitSlop,
  duration,
} from "@/theme/unified";

export type InputSize = "sm" | "md" | "lg";
export type LabelPosition = "floating" | "fixed" | "none";

export interface EnhancedInputProps extends Omit<TextInputProps, "style"> {
  label?: string;
  labelPosition?: LabelPosition;
  helperText?: string;
  error?: string;
  success?: boolean;
  successMessage?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  size?: InputSize;
  showCounter?: boolean;
  maxLength?: number;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  disabled?: boolean;
  fullWidth?: boolean;
}

const AnimatedText = Animated.createAnimatedComponent(Text);

const SIZE_CONFIG: Record<
  InputSize,
  { height: number; fontSize: number; iconSize: number; paddingHorizontal: number }
> = {
  sm: {
    height: touchTargets.minimum,
    fontSize: fontSize.md,
    iconSize: 18,
    paddingHorizontal: spacing.md,
  },
  md: {
    height: 48,
    fontSize: fontSize.lg,
    iconSize: 20,
    paddingHorizontal: spacing.lg,
  },
  lg: {
    height: touchTargets.large,
    fontSize: fontSize.xl,
    iconSize: 24,
    paddingHorizontal: spacing.lg,
  },
};

const resolveBorderColor = (
  error: string | undefined,
  success: boolean | undefined,
  isFocused: boolean,
) => {
  if (error) return semanticColors.status.error;
  if (success) return semanticColors.status.success;
  if (isFocused) return semanticColors.input.focus;
  return semanticColors.input.border;
};

const resolveIconColor = (
  error: string | undefined,
  success: boolean | undefined,
  isFocused: boolean,
  disabled: boolean,
) => {
  if (disabled) return semanticColors.text.disabled;
  if (error) return semanticColors.status.error;
  if (success) return semanticColors.status.success;
  if (isFocused) return semanticColors.interactive.default;
  return semanticColors.input.placeholder;
};

const getHelperMessage = (
  error: string | undefined,
  success: boolean | undefined,
  successMessage: string | undefined,
  helperText: string | undefined,
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
  success: boolean | undefined,
  isFocused: boolean,
  disabled: boolean,
) => {
  if (disabled) return semanticColors.text.disabled;
  if (error) return semanticColors.status.error;
  if (success) return semanticColors.status.success;
  if (isFocused) return semanticColors.interactive.default;
  return semanticColors.text.secondary;
};

const resolveRightIconName = (
  isPassword: boolean,
  isPasswordVisible: boolean,
  rightIcon?: keyof typeof Ionicons.glyphMap,
) => {
  if (isPassword) {
    return isPasswordVisible ? ("eye-off" as const) : ("eye" as const);
  }
  return rightIcon;
};

const resolveFixedLabel = (labelPosition: LabelPosition, label?: string) =>
  labelPosition === "fixed" ? label : undefined;

const resolveContainerBackground = (disabled: boolean) =>
  disabled ? colors.neutral[50] : semanticColors.input.background;

const resolveRightActionHandler = (
  isPassword: boolean,
  togglePasswordVisibility: () => void,
  onRightIconPress?: () => void,
) => (isPassword ? togglePasswordVisibility : onRightIconPress);

const buildInputStyles = (
  config: { fontSize: number },
  textColor: string,
  hasLeftIcon: boolean,
  hasRightAction: boolean,
  inputStyle?: StyleProp<TextStyle>,
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

const FixedLabel = ({
  label,
  color,
}: {
  label?: string;
  color: string;
}) => {
  if (!label) return null;
  return <Text style={[styles.fixedLabel, { color }]}>{label}</Text>;
};

const FloatingLabel = ({
  label,
  visible,
  color,
  backgroundColor,
  left,
  top,
  animatedStyle,
}: {
  label?: string;
  visible: boolean;
  color: string;
  backgroundColor: string;
  left: number;
  top: number;
  animatedStyle: any;
}) => {
  if (!label || !visible) return null;
  return (
    <AnimatedText
      style={[
        styles.floatingLabel,
        { color, backgroundColor, left, top },
        animatedStyle,
      ]}
    >
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
      hitSlop={hitSlop.small}
      accessibilityRole="button"
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
}: {
  helper: { text: string; colorKey: "error" | "success" | "textSecondary" } | null;
  showCounter: boolean;
  charCount: number;
  maxLength?: number;
}) => (
  <View style={styles.bottomRow}>
    <View style={styles.helperContainer}>
      {helper ? (
        <Text
          style={[
            styles.helperText,
            helper.colorKey === "error" && styles.helperTextError,
            helper.colorKey === "success" && styles.helperTextSuccess,
            helper.colorKey === "textSecondary" && styles.helperTextSecondary,
          ]}
        >
          {helper.text}
        </Text>
      ) : null}
    </View>

    {showCounter && maxLength ? (
      <Text
        style={[
          styles.counter,
          styles.helperTextSecondary,
          charCount >= maxLength && styles.helperTextError,
        ]}
      >
        {charCount}/{maxLength}
      </Text>
    ) : null}
  </View>
);

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
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const labelProgress = useSharedValue(value?.length ? 1 : 0);
  const isMultiline = Boolean(rest.multiline);

  const config = SIZE_CONFIG[size];
  const borderColor = resolveBorderColor(error, success, isFocused);
  const iconColor = resolveIconColor(error, success, isFocused, disabled);
  const helper = getHelperMessage(error, success, successMessage, helperText);
  const isPassword = Boolean(secureTextEntry);
  const showRightAction = Boolean(rightIcon || isPassword);
  const rightIconName = resolveRightIconName(
    isPassword,
    isPasswordVisible,
    rightIcon,
  );
  const finalSecureEntry = isPassword && !isPasswordVisible;
  const charCount = value?.length || 0;
  const showCounterText = Boolean(showCounter && maxLength);
  const fixedLabel = resolveFixedLabel(labelPosition, label);
  const fixedLabelColor = error
    ? semanticColors.status.error
    : success
      ? semanticColors.status.success
      : semanticColors.text.primary;
  const floatingLabelColor = resolveFloatingLabelColor(
    error,
    success,
    isFocused,
    disabled,
  );
  const containerBackground = resolveContainerBackground(disabled);
  const inputStyles = buildInputStyles(
    config,
    disabled ? semanticColors.text.disabled : semanticColors.input.text,
    Boolean(leftIcon),
    showRightAction,
    inputStyle,
  );
  const floatingLabelLeft =
    config.paddingHorizontal + (leftIcon ? config.iconSize + spacing.sm : 0);
  const floatingLabelTop = Math.max(
    spacing.sm,
    (config.height - fontSize.md) / 2 - spacing.xs,
  );
  const borderWidth = isFocused && !error && !success ? 2 : 1;

  React.useEffect(() => {
    labelProgress.value = withTiming(
      isFocused || (value?.length ?? 0) > 0 ? 1 : 0,
      { duration: duration.fast },
    );
  }, [isFocused, labelProgress, value]);

  const handleFocus = useCallback(
    (e: any) => {
      setIsFocused(true);
      onFocus?.(e);
    },
    [onFocus],
  );

  const handleBlur = useCallback(
    (e: any) => {
      setIsFocused(false);
      onBlur?.(e);
    },
    [onBlur],
  );

  const togglePasswordVisibility = useCallback(() => {
    setIsPasswordVisible((prev) => !prev);
  }, []);

  const rightActionPress = resolveRightActionHandler(
    isPassword,
    togglePasswordVisibility,
    onRightIconPress,
  );

  const labelAnimatedStyle = useAnimatedStyle(() => {
    if (labelPosition !== "floating") return {};

    return {
      transform: [
        {
          translateY: interpolate(
            labelProgress.value,
            [0, 1],
            [0, -(config.height / 2) + spacing.sm],
          ),
        },
        {
          scale: interpolate(labelProgress.value, [0, 1], [1, 0.85]),
        },
      ],
    };
  });

  return (
    <View
      style={[
        styles.container,
        fullWidth ? styles.fullWidth : undefined,
        containerStyle,
      ]}
    >
      <FixedLabel label={fixedLabel} color={fixedLabelColor} />

      <View
        style={[
          styles.inputContainer,
          {
            minHeight: config.height,
            paddingHorizontal: config.paddingHorizontal,
            paddingVertical: isMultiline ? spacing.sm : 0,
            borderColor,
            borderWidth,
            backgroundColor: containerBackground,
            alignItems: isMultiline ? "flex-start" : "center",
          },
        ]}
      >
        <FloatingLabel
          label={label}
          visible={labelPosition === "floating"}
          color={floatingLabelColor}
          backgroundColor={containerBackground}
          left={floatingLabelLeft}
          top={floatingLabelTop}
          animatedStyle={labelAnimatedStyle}
        />

        {leftIcon ? (
          <Ionicons
            name={leftIcon}
            size={config.iconSize}
            color={iconColor}
            style={styles.leftIcon}
          />
        ) : null}

        <TextInput
          ref={inputRef}
          style={inputStyles}
          placeholderTextColor={semanticColors.input.placeholder}
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
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  fullWidth: {
    width: "100%",
  },
  fixedLabel: {
    ...textStyles.label,
    marginBottom: spacing.xs,
  },
  inputContainer: {
    flexDirection: "row",
    borderRadius: radius.sm,
    position: "relative",
  },
  floatingLabel: {
    ...textStyles.label,
    position: "absolute",
    fontSize: fontSize.md,
    paddingHorizontal: spacing.xs,
    zIndex: 1,
  },
  leftIcon: {
    marginRight: spacing.sm,
    marginTop: spacing.xs,
  },
  rightIcon: {
    marginLeft: spacing.sm,
    padding: spacing.xs,
  },
  input: {
    ...textStyles.body,
    flex: 1,
    paddingVertical: spacing.md,
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
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  helperContainer: {
    flex: 1,
  },
  helperText: {
    ...textStyles.captionSmall,
  },
  helperTextError: {
    color: semanticColors.status.error,
  },
  helperTextSuccess: {
    color: semanticColors.status.success,
  },
  helperTextSecondary: {
    color: semanticColors.text.secondary,
  },
  counter: {
    ...textStyles.captionSmall,
    marginLeft: spacing.sm,
  },
});

export default EnhancedInput;
