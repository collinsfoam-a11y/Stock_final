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
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";

import {
  colors as unifiedColors,
  semanticColors,
  spacing as unifiedSpacing,
  radius as unifiedRadius,
  fontSize,
  fontWeight,
  textStyles,
} from "../../theme/unified";

interface ModernInputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  disabled?: boolean;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "numeric" | "email-address" | "phone-pad";
  maxLength?: number;
  multiline?: boolean;
  numberOfLines?: number;
  icon?: keyof typeof Ionicons.glyphMap;
  onIconPress?: () => void;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  onSubmitEditing?: () => void;
  returnKeyType?: "done" | "go" | "next" | "search" | "send";
  required?: boolean;
  style?: ViewStyle;
  inputStyle?: TextStyle;
  containerStyle?: ViewStyle;
  showClearButton?: boolean;
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
  returnKeyType,
  required = false,
  style,
  inputStyle,
  containerStyle,
  showClearButton = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const isPassword = secureTextEntry;
  const showPasswordToggle = isPassword && value.length > 0;

  const togglePasswordVisibility = () => {
    setIsPasswordVisible(!isPasswordVisible);
  };

  const handleClear = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onChangeText("");
    inputRef.current?.focus();
  };

  const getInputContainerStyles = (): ViewStyle => {
    const baseStyles: ViewStyle = {
      borderRadius: unifiedRadius.sm,
      borderWidth: 1,
      backgroundColor: disabled
        ? unifiedColors.neutral[50]
        : semanticColors.input.background,
      flexDirection: "row",
      alignItems: multiline ? "flex-start" : "center",
      paddingHorizontal: unifiedSpacing.md,
      paddingVertical: multiline ? unifiedSpacing.md : unifiedSpacing.sm,
      minHeight: multiline ? 80 : 44,
      borderColor: semanticColors.input.border,
    };

    // Border color logic aligned with DESIGN.md
    if (error) {
      baseStyles.borderColor = semanticColors.status.error;
      baseStyles.backgroundColor = unifiedColors.error[50];
    } else if (isFocused) {
      baseStyles.borderColor = semanticColors.input.focus;
      baseStyles.borderWidth = 2;
    }

    return baseStyles;
  };

  const getInputStyles = (): TextStyle => {
    return {
      flex: 1,
      fontSize: fontSize.lg,
      fontWeight: fontWeight.regular,
      color: disabled ? unifiedColors.neutral[400] : semanticColors.input.text,
      paddingTop: multiline ? unifiedSpacing.xs : 0,
      textAlignVertical: multiline ? "top" : "center",
    };
  };

  const getLabelStyles = (): TextStyle => {
    return {
      ...textStyles.label,
      color: error ? semanticColors.status.error : semanticColors.text.primary,
      marginBottom: unifiedSpacing.xs,
    };
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
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
            onPress={onIconPress}
            style={styles.iconContainer}
            disabled={!onIconPress}
          >
            <Ionicons
              name={icon}
              size={20}
              color={
                error
                  ? semanticColors.status.error
                  : semanticColors.input.placeholder
              }
            />
          </TouchableOpacity>
        )}

        <TextInput
          ref={inputRef}
          style={[getInputStyles(), inputStyle]}
          placeholder={placeholder}
          placeholderTextColor={semanticColors.input.placeholder}
          value={value}
          onChangeText={onChangeText}
          editable={!disabled}
          secureTextEntry={isPassword && !isPasswordVisible}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          maxLength={maxLength}
          multiline={multiline}
          numberOfLines={numberOfLines}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
        />

        {showClearButton && value.length > 0 && !disabled && (
          <TouchableOpacity
            onPress={handleClear}
            style={styles.iconContainer}
            accessibilityLabel="Clear input"
            accessibilityRole="button"
          >
            <Ionicons
              name="close-circle"
              size={20}
              color={semanticColors.input.placeholder}
            />
          </TouchableOpacity>
        )}

        {showPasswordToggle && (
          <TouchableOpacity
            onPress={togglePasswordVisibility}
            style={styles.iconContainer}
          >
            <Ionicons
              name={isPasswordVisible ? "eye-off" : "eye"}
              size={20}
              color={semanticColors.input.placeholder}
            />
          </TouchableOpacity>
        )}

        {rightIcon && !showPasswordToggle && (
          <TouchableOpacity
            onPress={onRightIconPress}
            style={styles.iconContainer}
            disabled={!onRightIconPress}
          >
            <Ionicons
              name={rightIcon}
              size={20}
              color={semanticColors.input.placeholder}
            />
          </TouchableOpacity>
        )}
      </Pressable>

      {error && <Text style={styles.errorText}>{error}</Text>}
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
    color: semanticColors.status.error,
  },
  errorText: {
    fontSize: fontSize.xs,
    color: semanticColors.status.error,
    marginTop: unifiedSpacing.xs,
  },
});
export default ModernInput;
