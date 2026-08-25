/**
 * Input Component - Enhanced text input
 */

import React from "react";
import { TextInput, View, Text, StyleSheet, TextInputProps, Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../../hooks/useTheme";

import { AppTouchable } from "@/components/ui/AppTouchable";
import { getAccessibleButtonProps, getDecorativeIconProps } from "@/utils/accessibility";
import { haptics } from "@/services/haptics";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  rightIconColor?: string;
  onRightIconPress?: () => void;
  containerStyle?: object;
  rightIconAccessibilityLabel?: string;
  showClearButton?: boolean;
  onClear?: () => void;
}

export const Input = React.forwardRef<TextInput, InputProps>(
  (
    {
      label,
      error,
      leftIcon,
      rightIcon,
      rightIconColor,
      onRightIconPress,
      containerStyle,
      rightIconAccessibilityLabel,
      showClearButton = false,
      onClear,
      ...textInputProps
    },
    ref
  ) => {
    const theme = useTheme();
    const internalRef = React.useRef<TextInput>(null);
    const resolvedRef = (ref as React.MutableRefObject<TextInput>) || internalRef;
    const valueStr = String(textInputProps.value ?? textInputProps.defaultValue ?? "");

    const showClear = showClearButton && valueStr.length > 0 && textInputProps.editable !== false;

    const handleClear = () => {
      void haptics.light();
      if (textInputProps.onChangeText) {
        textInputProps.onChangeText("");
      }
      if (onClear) {
        onClear();
      }
      resolvedRef.current?.focus();
    };

    return (
      <View style={[styles.container, containerStyle]}>
        {label && <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>}
        <View
          style={[
            styles.inputContainer,
            {
              borderColor: error ? theme.colors.error : theme.colors.border,
              backgroundColor: theme.colors.surface,
            },
            textInputProps.multiline && styles.multilineContainer,
          ]}
        >
          {leftIcon && (
            <Ionicons
              name={leftIcon}
              size={20}
              color={theme.colors.placeholder}
              style={styles.leftIcon}
              {...getDecorativeIconProps()}
            />
          )}
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            ref={resolvedRef}
            style={[
              styles.input,
              {
                color: theme.colors.text,
              },
              textInputProps.multiline && styles.multilineInput,
              Platform.OS === "web" && styles.inputWeb,
            ]}
            placeholderTextColor={theme.colors.placeholder}
            {...(Platform.OS === "web"
              ? {
                  // Web-specific props to ensure input works
                  autoComplete: textInputProps.autoComplete || "off",
                  spellCheck:
                    textInputProps.spellCheck !== undefined ? textInputProps.spellCheck : true,
                }
              : {})}
            {...textInputProps}
          />
          {showClear && (
            <AppTouchable
              onPress={handleClear}
              style={styles.rightIcon}
              activeOpacity={0.7}
              {...getAccessibleButtonProps({
                label: `Clear ${label || "input"}`,
              })}
            >
              <Ionicons
                name="close-circle"
                size={20}
                color={theme.colors.placeholder}
                {...getDecorativeIconProps()}
              />
            </AppTouchable>
          )}
          {rightIcon && !showClear && (
            <AppTouchable
              onPress={() => {
                if (onRightIconPress) {
                  void haptics.light();
                  onRightIconPress();
                }
              }}
              style={styles.rightIcon}
              activeOpacity={0.7}
              disabled={!onRightIconPress}
              {...(onRightIconPress
                ? getAccessibleButtonProps({
                    label: rightIconAccessibilityLabel ?? `${label || "Input"} right action`,
                  })
                : {})}
            >
              <Ionicons
                name={rightIcon}
                size={20}
                color={rightIconColor || theme.colors.placeholder}
                {...getDecorativeIconProps()}
              />
            </AppTouchable>
          )}
        </View>
        {error && <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>}
      </View>
    );
  }
);

Input.displayName = "Input";

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  multilineContainer: {
    alignItems: "flex-start",
    paddingVertical: 12,
  },
  leftIcon: {
    marginRight: 8,
  },
  rightIcon: {
    marginLeft: 8,
    padding: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  inputWeb: {
    // Web-specific styles to ensure input is interactive
    outline: "none",
    WebkitUserSelect: "text",
    userSelect: "text",
    cursor: "text",
  } as any,
  multilineInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  error: {
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
});
