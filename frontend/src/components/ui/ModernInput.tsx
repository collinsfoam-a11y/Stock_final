/**
 * ModernInput
 *
 * Compatibility wrapper around the shared themed input primitive.
 */

import React from "react";
import { StyleProp, TextStyle, ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { EnhancedInput } from "./EnhancedInput";

interface ModernInputProps {
  label?: string;
  placeholder?: string;
  testID?: string;
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
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}

export const ModernInput: React.FC<ModernInputProps> = ({
  label,
  placeholder,
  testID,
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
  onIconPress: _onIconPress,
  rightIcon,
  onRightIconPress,
  onSubmitEditing,
  returnKeyType,
  required = false,
  style,
  inputStyle,
  containerStyle,
}) => {
  const resolvedLabel = label
    ? required
      ? `${label} *`
      : label
    : undefined;

  return (
    <EnhancedInput
      label={resolvedLabel}
      labelPosition={resolvedLabel ? "fixed" : "none"}
      placeholder={placeholder}
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      error={error}
      disabled={disabled}
      secureTextEntry={secureTextEntry}
      autoCapitalize={autoCapitalize}
      keyboardType={keyboardType}
      maxLength={maxLength}
      multiline={multiline}
      numberOfLines={numberOfLines}
      leftIcon={icon}
      rightIcon={rightIcon}
      onRightIconPress={onRightIconPress}
      onSubmitEditing={onSubmitEditing}
      returnKeyType={returnKeyType}
      containerStyle={[containerStyle, style]}
      inputStyle={inputStyle}
    />
  );
};

export default ModernInput;
