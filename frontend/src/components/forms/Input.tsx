/**
 * Input Component - Enhanced text input
 */

import React from "react";
import { TextInput, View, Text, StyleSheet, TextInputProps, Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../../hooks/useTheme";
import { getAccessibleButtonProps, getDecorativeIconProps } from "@/utils/accessibility";
import { haptics } from "@/services/haptics";

import { AppTouchable } from "@/components/ui/AppTouchable";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  rightIconColor?: string;
  onRightIconPress?: () => void;
  containerStyle?: object;
  accessibilityLabel?: string;
  accessibilityHint?: string;
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
      accessibilityLabel,
      accessibilityHint,
      ...textInputProps
    },
    ref
  ) => {
    const theme = useTheme();

    const handleRightIconPress = () => {
      if (onRightIconPress) {
        void haptics.light();
        onRightIconPress();
      }
    };

    const computedAccessibilityLabel =
      accessibilityLabel || label || textInputProps.placeholder || "Text input";
    const computedAccessibilityHint = error ? `Error: ${error}` : accessibilityHint;

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
            ref={ref}
            accessibilityLabel={computedAccessibilityLabel}
            accessibilityHint={computedAccessibilityHint}
            aria-invalid={Boolean(error)}
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
          {rightIcon && (
            <AppTouchable
              onPress={handleRightIconPress}
              style={styles.rightIcon}
              activeOpacity={0.7}
              {...getAccessibleButtonProps({
                label: `${rightIcon} action`,
                hint: `Triggers action for ${computedAccessibilityLabel}`,
              })}
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
        {error && (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            style={[styles.error, { color: theme.colors.error }]}
          >
            {error}
          </Text>
        )}
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
