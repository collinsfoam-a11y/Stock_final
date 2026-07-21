/**
 * AnimatedInput Component
 * Input field with smooth focus animations and haptic feedback
 * Inspired by rnx-ui input patterns
 */

import React, { useState, useRef, useCallback } from "react";
import {
  TextInput,
  TextInputProps,
  View,
  Text,
  StyleSheet,
  Animated,
  ViewStyle,
  TextStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { modernBorderRadius } from "../../styles/modernDesignSystem";
import { useUiTokens } from "@/hooks/useUiTokens";
import type { ThemeTokens } from "@/theme/themeTokens";

import { shadows as uiShadows } from "@/theme/legacyCompat";
interface AnimatedInputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
  labelStyle?: TextStyle;
  hapticOnFocus?: boolean;
  variant?: "default" | "filled" | "outlined";
}

export const AnimatedInput: React.FC<AnimatedInputProps> = ({
  label,
  error,
  containerStyle,
  labelStyle,
  hapticOnFocus = true,
  variant = "outlined",
  onFocus,
  onBlur,
  value,
  ...props
}) => {
  const tokens = useUiTokens();
  const styles = React.useMemo(() => createStyles(tokens), [tokens]);
  const [isFocused, setIsFocused] = useState(false);

  // Animation values
  const borderColor = useRef(new Animated.Value(0)).current;
  const labelPosition = useRef(new Animated.Value(value ? 1 : 0)).current;
  const labelScale = useRef(new Animated.Value(value ? 0.85 : 1)).current;
  const shadowOpacity = useRef(new Animated.Value(0)).current;

  const handleFocus = useCallback(
    (e: any) => {
      setIsFocused(true);

      // Haptic feedback on focus
      if (hapticOnFocus) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      // Animate border and label
      Animated.parallel([
        Animated.timing(borderColor, {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(labelPosition, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(labelScale, {
          toValue: 0.85,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(shadowOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      onFocus?.(e);
    },
    [borderColor, labelPosition, labelScale, shadowOpacity, hapticOnFocus, onFocus]
  );

  const handleBlur = useCallback(
    (e: any) => {
      setIsFocused(false);

      // Animate back if no value
      Animated.parallel([
        Animated.timing(borderColor, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(labelPosition, {
          toValue: value ? 1 : 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(labelScale, {
          toValue: value ? 0.85 : 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(shadowOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      onBlur?.(e);
    },
    [borderColor, labelPosition, labelScale, shadowOpacity, value, onBlur]
  );

  const animatedBorderColor = borderColor.interpolate({
    inputRange: [0, 1],
    outputRange: [
      error ? tokens.colors.error : tokens.colors.border,
      error ? tokens.colors.error : tokens.colors.accent,
    ],
  });

  const animatedLabelY = labelPosition.interpolate({
    inputRange: [0, 1],
    outputRange: [16, -8],
  });

  const getVariantStyles = (): ViewStyle => {
    switch (variant) {
      case "filled":
        return {
          backgroundColor: isFocused
            ? tokens.colors.surface
            : tokens.colors.surfaceElevated,
          borderWidth: 0,
          borderBottomWidth: 2,
          borderRadius: modernBorderRadius.md,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
        };
      case "outlined":
      default:
        return {
          backgroundColor: tokens.colors.surface,
          borderWidth: 1.5,
          borderRadius: modernBorderRadius.md,
        };
    }
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <Animated.View
        style={[
          styles.inputContainer,
          getVariantStyles(),
          {
            borderColor: animatedBorderColor,
            ...uiShadows.md,
          },
        ]}
      >
        {!!label && (
          <Animated.Text
            style={[
              styles.label,
              labelStyle,
              {
                transform: [{ translateY: animatedLabelY }, { scale: labelScale }],
                color: isFocused
                  ? tokens.colors.accent
                  : error
                    ? tokens.colors.error
                    : tokens.colors.textSecondary,
              },
            ]}
          >
            {label}
          </Animated.Text>
        )}
        <TextInput
          selectionColor={tokens.colors.accent}
          placeholderTextColor={tokens.colors.textMuted}
          {...props}
          value={value}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[styles.input, props.style, { paddingTop: label ? 20 : 12 }]}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Animated.View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const createStyles = (tokens: ThemeTokens) => StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  inputContainer: {
    position: "relative",
    ...uiShadows.md,
    elevation: 4,
  },
  label: {
    position: "absolute",
    left: 16,
    top: 0,
    backgroundColor: tokens.colors.surface,
    paddingHorizontal: 4,
    fontSize: 14,
    fontWeight: "500",
    zIndex: 1,
  },
  input: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    fontSize: 16,
    color: tokens.colors.textPrimary,
    minHeight: 52,
  },
  errorText: {
    marginTop: 4,
    marginLeft: 4,
    fontSize: 12,
    color: tokens.colors.error,
  },
});

export default AnimatedInput;
