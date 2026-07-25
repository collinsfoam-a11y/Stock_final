/**
 * AnimatedInput Component
 * Input field with smooth focus animations and haptic feedback
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
import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha, type ThemeTokens } from "@/theme/themeTokens";
import { font, gap, radius } from "@/theme/staffUiScale";

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

  const borderColor = useRef(new Animated.Value(0)).current;
  const labelPosition = useRef(new Animated.Value(value ? 1 : 0)).current;
  const labelScale = useRef(new Animated.Value(value ? 0.85 : 1)).current;
  const shadowOpacity = useRef(new Animated.Value(0)).current;

  const handleFocus = useCallback(
    (e: any) => {
      setIsFocused(true);

      if (hapticOnFocus) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

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
          borderRadius: radius.md,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
        };
      case "outlined":
      default:
        return {
          backgroundColor: tokens.colors.surface,
          borderWidth: 1.5,
          borderRadius: radius.md,
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
          style={[styles.input, props.style, { paddingTop: label ? 20 : gap.sm }]}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Animated.View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const createStyles = (tokens: ThemeTokens) =>
  StyleSheet.create({
    container: {
      marginBottom: gap.md,
    },
    inputContainer: {
      position: "relative",
      ...uiShadows.md,
      elevation: 4,
    },
    label: {
      position: "absolute",
      left: gap.md,
      top: 0,
      backgroundColor: tokens.colors.surface,
      paddingHorizontal: gap.xs,
      fontSize: font.size.base,
      fontWeight: font.weight.medium,
      zIndex: 1,
    },
    input: {
      paddingHorizontal: gap.md,
      paddingBottom: gap.sm,
      fontSize: font.size.lg,
      color: tokens.colors.textPrimary,
      minHeight: 52,
    },
    errorText: {
      marginTop: gap.xs,
      marginLeft: gap.xs,
      fontSize: font.size.sm,
      color: tokens.colors.error,
    },
  });

export default AnimatedInput;
