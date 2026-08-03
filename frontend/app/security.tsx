import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Switch, Platform } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useAuthStore } from "../src/store/authStore";
import { useSettingsStore } from "../src/store/settingsStore";
import { ModernHeader } from "../src/components/ui/ModernHeader";
import { ModernCard } from "../src/components/ui/ModernCard";
import { ModernInput } from "../src/components/ui/ModernInput";
import { ModernButton } from "../src/components/ui/ModernButton";
import { spacing, typography, borderRadius } from "@/theme/unified";

import { useUiTokens } from "@/hooks/useUiTokens";
import { colorWithAlpha } from "@/theme/themeTokens";
import { toastService } from "@/services/toastService";
import { safeBackNavigation } from "@/utils/navigation";
const MotionBlock = ({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: object;
}) => {
  if (Platform.OS === "web") {
    return <View style={style}>{children}</View>;
  }

  return (
    <Animated.View entering={FadeInDown.delay(delay).springify()} style={style}>
      {children}
    </Animated.View>
  );
};

export default function SecuritySettingsScreen() {
  const router = useRouter();
  const { pinSetup, isLoading } = useAuthStore();
  const { settings, setSetting } = useSettingsStore();
  const uiTokens = useUiTokens();

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const handleSavePin = useCallback(async () => {
    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      toastService.showError("PIN must be exactly 4 digits.");
      return;
    }

    if (pin !== confirmPin) {
      toastService.showError("PINs do not match.");
      return;
    }

    const result = await pinSetup(pin, confirmPin);
    if (result.success) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      toastService.showSuccess("Security PIN updated successfully.");
      setPin("");
      setConfirmPin("");
    } else {
      toastService.showError(result.message || "Failed to update PIN.");
    }
  }, [pin, confirmPin, pinSetup]);

  const toggleBiometrics = useCallback(
    async (val: boolean) => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      if (val) {
        try {
          const LocalAuthentication = await import("expo-local-authentication");
          const hasHardware = await LocalAuthentication.hasHardwareAsync();
          const isEnrolled = await LocalAuthentication.isEnrolledAsync();

          if (!hasHardware) {
            toastService.showError("Biometric hardware is not available on this device.");
            return;
          }
          if (!isEnrolled) {
            toastService.showError("No fingerprints or Face ID enrolled on this device.");
            return;
          }
        } catch (_err) {
          // ignore error on non-compatible platforms
        }
      }
      setSetting("biometricAuth", val);
      toastService.showInfo(val ? "Biometric login enabled." : "Biometric login disabled.");
    },
    [setSetting]
  );

  const renderSectionHeader = (title: string) => (
    <Text style={[styles.sectionTitle, { color: uiTokens.colors.textMuted }]}>{title}</Text>
  );

  return (
    <View style={[styles.container, { backgroundColor: uiTokens.colors.background }]}>
      <StatusBar style={uiTokens.mode === "dark" ? "light" : "dark"} />
      <ModernHeader
        title="Security Settings"
        subtitle="PIN and device unlock"
        showBackButton
        onBackPress={() => safeBackNavigation(router, { fallbackHref: "/welcome" })}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <MotionBlock delay={100}>
          {renderSectionHeader("PIN Authentication")}
          <ModernCard style={styles.card}>
            <Text style={[styles.description, { color: uiTokens.colors.textSecondary }]}>
              Set a 4-digit PIN for quick and secure login to this device.
            </Text>

            <ModernInput
              label="New PIN"
              placeholder="4 Digits"
              value={pin}
              onChangeText={setPin}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
              icon="keypad"
            />

            <View style={{ height: spacing.md }} />

            <ModernInput
              label="Confirm PIN"
              placeholder="Repeat 4 Digits"
              value={confirmPin}
              onChangeText={setConfirmPin}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
              icon="checkbox"
            />

            <ModernButton
              title="Update Secure PIN"
              onPress={handleSavePin}
              loading={isLoading}
              style={styles.saveButton}
              variant="primary"
            />
          </ModernCard>
        </MotionBlock>

        <MotionBlock delay={200}>
          {renderSectionHeader("Biometric Login")}
          <ModernCard style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View
                  style={[
                    styles.iconContainer,
                    {
                      backgroundColor: colorWithAlpha(
                        uiTokens.colors.accent,
                        uiTokens.mode === "dark" ? 0.18 : 0.1
                      ),
                    },
                  ]}
                >
                  <Ionicons name="finger-print" size={20} color={uiTokens.colors.accent} />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, { color: uiTokens.colors.textPrimary }]}>
                    TouchID / FaceID
                  </Text>
                  <Text style={[styles.rowSublabel, { color: uiTokens.colors.textSecondary }]}>
                    Use biometrics to unlock
                  </Text>
                </View>
              </View>
              <Switch
                value={settings.biometricAuth}
                onValueChange={toggleBiometrics}
                trackColor={{
                  false: uiTokens.colors.border,
                  true: uiTokens.colors.accent,
                }}
                thumbColor={uiTokens.colors.surfaceElevated}
                ios_backgroundColor={uiTokens.colors.border}
              />
            </View>
          </ModernCard>
        </MotionBlock>

        <View
          style={[
            styles.infoBox,
            {
              backgroundColor: colorWithAlpha(
                uiTokens.colors.info,
                uiTokens.mode === "dark" ? 0.16 : 0.08
              ),
            },
          ]}
        >
          <Ionicons name="information-circle-outline" size={20} color={uiTokens.colors.info} />
          <Text style={[styles.infoText, { color: uiTokens.colors.textSecondary }]}>
            Your PIN is hashed using Argon2 and stored on the server. If you enable biometric login,
            your PIN is stored securely on this device (Keychain/Keystore) so biometrics can unlock
            without retyping it.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    textTransform: "uppercase",
    letterSpacing: 0,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  description: {
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  saveButton: {
    marginTop: spacing.xl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: spacing.md,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
  rowSublabel: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  infoBox: {
    flexDirection: "row",
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: typography.fontSize.xs,
    lineHeight: 18,
  },
});
