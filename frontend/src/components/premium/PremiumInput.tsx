/**
 * PremiumInput Component
 *
 * @deprecated Use AppInput. This file is a wrapper-only migration facade.
 */

import React from "react";
import { type KeyboardTypeOptions, type TextStyle, type ViewStyle } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { AppInput } from "../ui/AppInput";
import { warnDeprecatedVisualSystem } from "../ui/legacyVisualSystem";

type InputVariant = "default" | "outlined" | "filled" | "underlined";

interface PremiumInputProps {
  label?: string;
  value: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  variant?: InputVariant;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  editable?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  style?: ViewStyle;
  inputStyle?: TextStyle;
  testID?: string;
  maxLength?: number;
  required?: boolean;
  onBlur?: () => void;
  onSubmitEditing?: () => void;
  autoCorrect?: boolean;
  returnKeyType?: "done" | "go" | "next" | "search" | "send";
}

export const PremiumInput: React.FC<PremiumInputProps> = ({
  onChangeText,
  style,
  variant: _variant,
  ...props
}) => {
  warnDeprecatedVisualSystem("PremiumInput");

  return (
    <AppInput
      {...props}
      onChangeText={onChangeText ?? (() => {})}
      containerStyle={style}
    />
  );
};

export type { PremiumInputProps, InputVariant };
