/**
 * AppearanceSettings Component
 *
 * Complete appearance customization section for Settings screen
 * Limits customization to theme mode, font size, and font style
 */

import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useTheme } from "../../hooks/useTheme";
import { useUiTokens } from "../../hooks/useUiTokens";
import { useSettingsStore } from "../../store/settingsStore";
import { ThemePicker } from "./ThemePicker";
import { GlassCard } from "./GlassCard";
import { FontSizeSlider, FontStylePicker } from "../settings";
import { flags } from "../../constants/flags";

interface AppearanceSettingsProps {
  showTitle?: boolean;
  scrollable?: boolean;
  compact?: boolean;
}

export const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({
  showTitle = true,
  scrollable = true,
  compact = false,
}) => {
  const { colors, typography } = useTheme();
  const uiTokens = useUiTokens();
  const { settings, setSetting } = useSettingsStore();

  const handleFontSizeChange = (value: number) => {
    setSetting("fontSizeValue", value);
  };

  const content = (
    <View style={styles.container}>
      {showTitle && (
        <Animated.View entering={FadeInDown.delay(0).springify()}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Appearance</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Customize the look and feel of your app
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Theme Mode */}
      <Animated.View entering={FadeInDown.delay(100).springify()}>
        <GlassCard variant="medium" padding={16} style={styles.section}>
          <ThemePicker compact={compact} />
        </GlassCard>
      </Animated.View>

      {/* Font Size */}
      <Animated.View entering={FadeInDown.delay(200).springify()}>
        <GlassCard variant="medium" padding={0} style={styles.section}>
          <FontSizeSlider
            value={typeof settings.fontSizeValue === "number" ? settings.fontSizeValue : 16}
            onValueChange={handleFontSizeChange}
          />
        </GlassCard>
      </Animated.View>

      {/* Font Style */}
      <Animated.View entering={FadeInDown.delay(300).springify()}>
        <GlassCard variant="medium" padding={0} style={styles.section}>
          <FontStylePicker
            value={settings.fontStyle}
            onValueChange={(value) => setSetting("fontStyle", value)}
          />
        </GlassCard>
      </Animated.View>

      {/* Preview Card */}
      <Animated.View entering={FadeInDown.delay(400).springify()}>
        <GlassCard variant="strong" padding={20} style={styles.section}>
          <Text style={[styles.previewTitle, { color: colors.text }]}>Preview</Text>
          <View style={[styles.previewBox, { backgroundColor: colors.background }]}>
            <View style={[styles.previewHeader, { backgroundColor: colors.surface }]}>
              <View style={[styles.previewDot, { backgroundColor: colors.accent }]} />
              <View style={[styles.previewLine, { backgroundColor: colors.text, width: "40%" }]} />
            </View>
            <View style={styles.previewContent}>
              <View style={[styles.previewCard, { backgroundColor: colors.surface }]}>
                <View
                  style={[
                    styles.previewLine,
                    {
                      backgroundColor: colors.text,
                      width: "60%",
                      height: Math.max(8, settings.fontSizeValue * 0.55),
                    },
                  ]}
                />
                <View
                  style={[
                    styles.previewLine,
                    {
                      backgroundColor: colors.textSecondary,
                      width: "80%",
                      height: Math.max(6, settings.fontSizeValue * 0.35),
                    },
                  ]}
                />
              </View>
              <View style={[styles.previewCard, { backgroundColor: colors.surface }]}>
                <View
                  style={[
                    styles.previewLine,
                    {
                      backgroundColor: colors.text,
                      width: "50%",
                      height: Math.max(8, settings.fontSizeValue * 0.5),
                    },
                  ]}
                />
                <View
                  style={[
                    styles.previewLine,
                    {
                      backgroundColor: colors.textSecondary,
                      width: "70%",
                      height: Math.max(6, settings.fontSizeValue * 0.32),
                    },
                  ]}
                />
              </View>
            </View>
            <Text
              style={[
                styles.previewSampleText,
                {
                  color: colors.text,
                  fontSize: settings.fontSizeValue,
                  fontFamily: typography.fontFamily.body,
                },
              ]}
            >
              Sample text uses your selected font style.
            </Text>
            <View style={[styles.previewButton, { backgroundColor: colors.accent }]}>
              <View
                style={[
                  styles.previewLine,
                  { backgroundColor: colors.surfaceElevated, width: "30%" },
                ]}
              />
            </View>
          </View>
        </GlassCard>
      </Animated.View>

      {flags.uiSettingsV2 && (
        <Animated.View entering={FadeInDown.delay(500).springify()}>
          <GlassCard variant="medium" padding={16} style={styles.section}>
            <Text style={[styles.previewTitle, { color: colors.text }]}>Experience Settings</Text>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              UI Upgrade Mode: {flags.uiVisualSystemV2 ? "Premium Visual" : "Classic"}
            </Text>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              Motion: {uiTokens.motion.enabled ? "Enabled" : "Disabled"}
            </Text>
            <View
              style={[
                styles.motionPreview,
                {
                  backgroundColor: uiTokens.colors.surface,
                  borderColor: uiTokens.colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.motionPreviewAccent,
                  {
                    backgroundColor: uiTokens.colors.accent,
                    opacity: uiTokens.motion.enabled ? 1 : 0.4,
                  },
                ]}
              />
              <Text style={[styles.motionLabel, { color: uiTokens.colors.textSecondary }]}>
                Motion timings: {uiTokens.motion.fast}/{uiTokens.motion.normal}/
                {uiTokens.motion.slow}ms
              </Text>
            </View>
          </GlassCard>
        </Animated.View>
      )}
    </View>
  );

  if (scrollable) {
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {content}
      </ScrollView>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  container: {
    gap: 16,
    padding: 16,
  },
  header: {
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  section: {
    marginBottom: 0,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  previewBox: {
    borderRadius: 12,
    overflow: "hidden",
    padding: 12,
    gap: 10,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    gap: 10,
  },
  previewDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  previewLine: {
    height: 8,
    borderRadius: 4,
    opacity: 0.8,
  },
  previewContent: {
    gap: 8,
  },
  previewCard: {
    padding: 12,
    borderRadius: 8,
    gap: 6,
  },
  previewButton: {
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 8,
  },
  previewSampleText: {
    marginTop: 4,
  },
  infoText: {
    fontSize: 13,
    marginBottom: 6,
  },
  motionPreview: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  motionPreviewAccent: {
    height: 8,
    borderRadius: 999,
    marginBottom: 10,
    width: "70%",
  },
  motionLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
});

export default AppearanceSettings;
