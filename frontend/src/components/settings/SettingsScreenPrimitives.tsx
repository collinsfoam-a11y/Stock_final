import React, { useCallback } from "react";
import {
  type KeyboardTypeOptions,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";

import { useUiTokens } from "../../hooks/useUiTokens";
import { colorWithAlpha } from "../../theme/themeTokens";
import { AnimatedPressable } from "../ui/AnimatedPressable";
import ModernCard from "../ui/ModernCard";

type SettingsRowType = "navigation" | "action" | "switch" | "select";

export interface SettingsActionRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  type?: SettingsRowType;
  value?: boolean;
  valueLabel?: string;
  onValueChange?: (value: boolean) => void;
  onToggle?: (value: boolean) => void;
  onPress?: () => void;
  rightLabel?: string;
  disabled?: boolean;
  destructive?: boolean;
}

export interface SettingsTextInputRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  description?: string;
  keyboardType?: KeyboardTypeOptions;
  placeholder?: string;
  disabled?: boolean;
  testID?: string;
}

export function SettingsSectionHeading({ title }: { title: string }) {
  const uiTokens = useUiTokens();

  return (
    <Text
      style={[
        styles.sectionTitle,
        {
          color: uiTokens.colors.textMuted,
          marginTop: uiTokens.spacing.lg,
          marginBottom: uiTokens.spacing.sm,
        },
      ]}
    >
      {title}
    </Text>
  );
}

export function SettingsActionSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      <SettingsSectionHeading title={title} />
      <ModernCard
        accessible={false}
        variant="outlined"
        elevation="none"
        padding={0}
        style={styles.card}
      >
        {children}
      </ModernCard>
    </View>
  );
}

export function SettingsSectionDivider() {
  const uiTokens = useUiTokens();
  return <View style={[styles.divider, { backgroundColor: uiTokens.colors.border }]} />;
}

export function SettingsTextInputRow({
  icon,
  label,
  value,
  onChangeText,
  description,
  keyboardType = "default",
  placeholder,
  disabled = false,
  testID,
}: SettingsTextInputRowProps) {
  const uiTokens = useUiTokens();
  const mutedBorder = colorWithAlpha(
    uiTokens.colors.textMuted,
    uiTokens.mode === "dark" ? 0.32 : 0.22
  );

  return (
    <View style={[styles.inputRow, disabled && styles.disabledRow]}>
      <View style={styles.inputHeader}>
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: colorWithAlpha(
                uiTokens.colors.accent,
                uiTokens.mode === "dark" ? 0.2 : 0.12
              ),
              borderRadius: uiTokens.radius.md,
            },
          ]}
        >
          <Ionicons name={icon} size={19} color={uiTokens.colors.accent} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.label, { color: uiTokens.colors.textPrimary }]}>{label}</Text>
          {description ? (
            <Text style={[styles.description, { color: uiTokens.colors.textSecondary }]}>
              {description}
            </Text>
          ) : null}
        </View>
      </View>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor={uiTokens.colors.textMuted}
        style={[
          styles.textInput,
          {
            backgroundColor: uiTokens.colors.surface,
            borderColor: mutedBorder,
            borderRadius: uiTokens.radius.md,
            color: uiTokens.colors.textPrimary,
          },
        ]}
        testID={testID}
        value={value}
      />
    </View>
  );
}

export function SettingsActionRow({
  icon,
  label,
  description,
  type = "navigation",
  value,
  valueLabel,
  onValueChange,
  onToggle,
  onPress,
  rightLabel,
  disabled = false,
  destructive = false,
}: SettingsActionRowProps) {
  const uiTokens = useUiTokens();
  const toneColor = destructive ? uiTokens.colors.error : uiTokens.colors.accent;

  const triggerSelection = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
  }, []);

  const handlePress = useCallback(() => {
    if (disabled) return;
    triggerSelection();
    onPress?.();
  }, [disabled, onPress, triggerSelection]);

  const handleToggle = useCallback(
    (nextValue: boolean) => {
      if (disabled) return;
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      (onValueChange ?? onToggle)?.(nextValue);
    },
    [disabled, onToggle, onValueChange]
  );

  const resolvedRightLabel = rightLabel ?? valueLabel;

  const rightContent =
    type === "switch" ? (
      <Switch
        accessibilityLabel={label}
        value={Boolean(value)}
        onValueChange={handleToggle}
        disabled={disabled}
        trackColor={{
          false: uiTokens.colors.border,
          true: uiTokens.colors.accent,
        }}
        thumbColor={uiTokens.colors.surfaceElevated}
        ios_backgroundColor={uiTokens.colors.border}
      />
    ) : (
      <View style={styles.rowRight}>
        {resolvedRightLabel ? (
          <Text
            style={[
              styles.rightLabel,
              { color: disabled ? uiTokens.colors.textMuted : uiTokens.colors.textSecondary },
            ]}
            numberOfLines={1}
          >
            {resolvedRightLabel}
          </Text>
        ) : null}
        {type === "navigation" || type === "select" ? (
          <Ionicons
            name="chevron-forward"
            size={18}
            color={disabled ? uiTokens.colors.textMuted : uiTokens.colors.textSecondary}
          />
        ) : null}
      </View>
    );

  const rowContent = (
    <View style={[styles.row, disabled && styles.disabledRow]}>
      <View style={styles.rowLeft}>
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: colorWithAlpha(toneColor, uiTokens.mode === "dark" ? 0.2 : 0.12),
              borderRadius: uiTokens.radius.md,
            },
          ]}
        >
          <Ionicons name={icon} size={19} color={toneColor} />
        </View>
        <View style={styles.copy}>
          <Text
            style={[
              styles.label,
              { color: destructive ? uiTokens.colors.error : uiTokens.colors.textPrimary },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.86}
          >
            {label}
          </Text>
          {description ? (
            <Text style={[styles.description, { color: uiTokens.colors.textSecondary }]}>
              {description}
            </Text>
          ) : null}
        </View>
      </View>
      {rightContent}
    </View>
  );

  if (type === "switch") {
    return rowContent;
  }

  return (
    <AnimatedPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      hapticFeedback="none"
      onPress={handlePress}
      style={styles.pressableRow}
    >
      {rowContent}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    marginLeft: 2,
    textTransform: "uppercase",
  },
  pressableRow: {
    width: "100%",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  disabledRow: {
    opacity: 0.5,
  },
  rowLeft: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    minWidth: 0,
    paddingRight: 12,
  },
  iconContainer: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    marginRight: 12,
    width: 36,
  },
  copy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  rowRight: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    maxWidth: "42%",
  },
  rightLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },
  inputRow: {
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputHeader: {
    alignItems: "center",
    flexDirection: "row",
  },
  textInput: {
    borderWidth: 1,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
