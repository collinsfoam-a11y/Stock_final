/**
 * Modern Input Component for Lavanya Mart Stock Verify
 * Accessible form input with modern design principles
 */

import React, { useState, useRef } from "react";
import {
  View,
  Pressable,
  TextInput,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  TouchableOpacity,
  type KeyboardTypeOptions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  colors as unifiedColors,
  spacing as unifiedSpacing,
  radius as unifiedRadius,
  fontSize,
  fontWeight,
  textStyles,
} from "@/theme/legacyCompat";

import { useUiTokens } from "@/hooks/useUiTokens";
import { haptics } from "@/services/haptics";
import { getAccessibleButtonProps } from "@/utils/accessibility";

interface ModernInputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  disabled?: boolean;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  multiline?: boolean;
  numberOfLines?: number;
  icon?: keyof typeof Ionicons.glyphMap;
  onIconPress?: () => void;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  onSubmitEditing?: () => void;
  onBlur?: React.ComponentProps<typeof TextInput>["onBlur"];
  onFocus?: React.ComponentProps<typeof TextInput>["onFocus"];
  returnKeyType?: "done" | "go" | "next" | "search" | "send";
  required?: boolean;
  testID?: string;
  showClearButton?: boolean;
  helperText?: string;
  editable?: boolean;
  autoCorrect?: boolean;
  style?: ViewStyle;
  inputStyle?: TextStyle;
  containerStyle?: ViewStyle;
}

export const ModernInput: React.FC<ModernInputProps> = ({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  disabled = false,
  secureTextEntry = false,
  autoCapitalize = "none",
  keyboardType = "default",
  maxLength,
  multiline = false,
  numberOfLines = 1,
  icon,
  onIconPress,
  rightIcon,
  onRightIconPress,
  onSubmitEditing,
  onBlur,
  onFocus,
  returnKeyType,
  required = false,
  testID,
  showClearButton = false,
  helperText,
  editable = true,
  autoCorrect,
  style,
  inputStyle,
  containerStyle,
}) => {
  const uiTokens = useUiTokens();
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const isPassword = secureTextEntry;
  const showPasswordToggle = isPassword && value.length > 0;
  const showClear = showClearButton && value.length > 0 && !disabled && editable;

  const togglePasswordVisibility = () => {
    void haptics.light();
    setIsPasswordVisible(!isPasswordVisible);
  };

  const handleClear = () => {
    void haptics.light();
    onChangeText?.("");
    inputRef.current?.focus();
  };

  const getInputContainerStyles = (): ViewStyle => {
    const baseStyles: ViewStyle = {
      borderRadius: unifiedRadius.sm,
      borderWidth: 1,
      backgroundColor: disabled
        ? uiTokens.mode === "dark"
          ? uiTokens.colors.surfaceElevated
          : unifiedColors.neutral[50]
        : uiTokens.colors.surface,
      flexDirection: "row",
      alignItems: multiline ? "flex-start" : "center",
      paddingHorizontal: unifiedSpacing.md,
      paddingVertical: multiline ? unifiedSpacing.md : unifiedSpacing.sm,
      minHeight: multiline ? 80 : 44,
      borderColor: uiTokens.colors.border,
    };

    // Border color logic aligned with DESIGN.md
    if (error) {
      baseStyles.borderColor = uiTokens.colors.error;
      baseStyles.backgroundColor =
        uiTokens.mode === "dark" ? "rgba(248, 81, 73, 0.12)" : unifiedColors.error[50];
    } else if (isFocused) {
      baseStyles.borderColor = uiTokens.colors.accent;
      baseStyles.borderWidth = 2;
    }

    return baseStyles;
  };

  const getInputStyles = (): TextStyle => {
    return {
      flex: 1,
      fontSize: fontSize.lg,
      fontWeight: fontWeight.regular,
      color: disabled ? uiTokens.colors.textMuted : uiTokens.colors.textPrimary,
      paddingTop: multiline ? unifiedSpacing.xs : 0,
      textAlignVertical: multiline ? "top" : "center",
    };
  };

  const getLabelStyles = (): TextStyle => {
    return {
      ...textStyles.label,
      color: error ? uiTokens.colors.error : uiTokens.colors.textPrimary,
      marginBottom: unifiedSpacing.xs,
    };
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {!!label && (
        <Text style={getLabelStyles()}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      )}

      <Pressable
        style={[getInputContainerStyles(), style]}
        onPress={() => inputRef.current?.focus()}
      >
        {icon && (
          <TouchableOpacity
            onPress={() => {
              void haptics.light();
              onIconPress?.();
            }}
            style={styles.iconContainer}
            disabled={!onIconPress}
            {...(onIconPress
              ? getAccessibleButtonProps({
                  label: `${label || "Input"} action`,
                })
              : {})}
          >
            <Ionicons
              name={icon}
              size={20}
              color={error ? uiTokens.colors.error : uiTokens.colors.textSecondary}
            />
          </TouchableOpacity>
        )}

        <TextInput
          ref={inputRef}
          style={[getInputStyles(), inputStyle]}
          placeholder={placeholder}
          placeholderTextColor={uiTokens.colors.textSecondary}
          value={value}
          onChangeText={onChangeText}
          editable={editable && !disabled}
          secureTextEntry={isPassword && !isPasswordVisible}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          keyboardType={keyboardType}
          maxLength={maxLength}
          multiline={multiline}
          numberOfLines={numberOfLines}
          onFocus={(event) => {
            setIsFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setIsFocused(false);
            onBlur?.(event);
          }}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          testID={testID}
        />

        {showClear && (
          <TouchableOpacity
            onPress={handleClear}
            style={styles.iconContainer}
            {...getAccessibleButtonProps({
              label: `Clear ${label || "input"}`,
            })}
          >
            <Ionicons name="close-circle" size={20} color={uiTokens.colors.textSecondary} />
          </TouchableOpacity>
        )}

        {showPasswordToggle && (
          <TouchableOpacity
            onPress={togglePasswordVisibility}
            style={styles.iconContainer}
            {...getAccessibleButtonProps({
              label: isPasswordVisible ? "Hide password" : "Show password",
            })}
          >
            <Ionicons
              name={isPasswordVisible ? "eye-off" : "eye"}
              size={20}
              color={uiTokens.colors.textSecondary}
            />
          </TouchableOpacity>
        )}

        {rightIcon && !showPasswordToggle && !showClear && (
          <TouchableOpacity
            onPress={() => {
              void haptics.light();
              onRightIconPress?.();
            }}
            style={styles.iconContainer}
            disabled={!onRightIconPress}
            {...(onRightIconPress
              ? getAccessibleButtonProps({
                  label: `${label || "Input"} right action`,
                })
              : {})}
          >
            <Ionicons name={rightIcon} size={20} color={uiTokens.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </Pressable>

      {Boolean(error) && <Text style={styles.errorText}>{error}</Text>}
      {!error && Boolean(helperText) && <Text style={styles.helperText}>{helperText}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: unifiedSpacing.md,
  },
  iconContainer: {
    padding: unifiedSpacing.xs,
  },
  required: {
    color: unifiedColors.error[500],
  },
  errorText: {
    fontSize: fontSize.xs,
    color: unifiedColors.error[500],
    marginTop: unifiedSpacing.xs,
  },
  helperText: {
    fontSize: fontSize.xs,
    color: unifiedColors.neutral[500],
    marginTop: unifiedSpacing.xs,
  },
});
export default ModernInput;
