import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useAuthStore } from "../src/store/authStore";
import { useSettingsStore } from "../src/store/settingsStore";
import ModernHeader from "../src/components/ui/ModernHeader";
import ModernCard from "../src/components/ui/ModernCard";
import ModernInput from "../src/components/ui/ModernInput";
import ModernButton from "../src/components/ui/ModernButton";
import { useThemeContext } from "../src/context/ThemeContext";

export default function SecuritySettingsScreen() {
  const router = useRouter();
  const { pinSetup, isLoading } = useAuthStore();
  const { settings, setSetting } = useSettingsStore();
  const { theme, themeLegacy, isDark } = useThemeContext();

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const styles = React.useMemo(
    () => createStyles(theme, themeLegacy),
    [theme, themeLegacy],
  );

  const handleSavePin = useCallback(async () => {
    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      Alert.alert("Error", "PIN must be exactly 4 digits.");
      return;
    }

    if (pin !== confirmPin) {
      Alert.alert("Error", "PINs do not match.");
      return;
    }

    const result = await pinSetup(pin, confirmPin);
    if (result.success) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Alert.alert("Success", "Security PIN updated successfully.");
      setPin("");
      setConfirmPin("");
    } else {
      Alert.alert("Error", result.message || "Failed to update PIN.");
    }
  }, [pin, confirmPin, pinSetup]);

  const toggleBiometrics = useCallback(
    (val: boolean) => {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setSetting("biometricAuth", val);
    },
    [setSetting],
  );

  const renderSectionHeader = (title: string) => (
    <Text style={styles.sectionTitle}>{title}</Text>
  );

  return (
    <View style={styles.container}>
      <StatusBar
        style={isDark ? "light" : "dark"}
        backgroundColor={theme.colors.background.default}
      />
      <ModernHeader
        title="Security Settings"
        showBackButton
        onBackPress={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          {renderSectionHeader("PIN Authentication")}
          <ModernCard style={styles.card}>
            <Text style={styles.description}>
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

            <View style={styles.inputSpacer} />

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
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify()}>
          {renderSectionHeader("Biometric Login")}
          <ModernCard style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons
                    name="finger-print"
                    size={20}
                    color={theme.colors.primary[500]}
                  />
                </View>
                <View>
                  <Text style={styles.rowLabel}>TouchID / FaceID</Text>
                  <Text style={styles.rowSublabel}>
                    Use biometrics to unlock
                  </Text>
                </View>
              </View>
              <Switch
                value={settings.biometricAuth}
                onValueChange={toggleBiometrics}
                trackColor={{
                  false: theme.colors.border.medium,
                  true: theme.colors.primary[500],
                }}
                thumbColor={theme.colors.text.inverse}
              />
            </View>
          </ModernCard>
        </Animated.View>

        <View style={styles.infoBox}>
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={theme.colors.text.secondary}
          />
          <Text style={styles.infoText}>
            Your PIN is hashed using Argon2 and stored on the server. If you
            enable biometric login, your PIN is stored securely on this device
            (Keychain/Keystore) so biometrics can unlock without retyping it.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (
  theme: ReturnType<typeof useThemeContext>["theme"],
  themeLegacy: ReturnType<typeof useThemeContext>["themeLegacy"],
) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background.default,
    },
    scrollContent: {
      padding: themeLegacy.spacing.lg,
    },
    sectionTitle: {
      fontSize: themeLegacy.typography.fontSize.xs,
      fontWeight: themeLegacy.typography.fontWeight.semibold,
      color: theme.colors.text.secondary,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: themeLegacy.spacing.sm,
      marginLeft: themeLegacy.spacing.xs,
    },
    card: {
      marginBottom: themeLegacy.spacing.xl,
      padding: themeLegacy.spacing.lg,
      backgroundColor: themeLegacy.colors.surface,
      borderColor: theme.colors.border.light,
    },
    description: {
      fontSize: themeLegacy.typography.fontSize.sm,
      color: theme.colors.text.secondary,
      lineHeight: 20,
      marginBottom: themeLegacy.spacing.lg,
    },
    inputSpacer: {
      height: themeLegacy.spacing.md,
    },
    saveButton: {
      marginTop: themeLegacy.spacing.xl,
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
      marginRight: themeLegacy.spacing.md,
    },
    iconContainer: {
      width: 36,
      height: 36,
      borderRadius: theme.borderRadius.md,
      backgroundColor: themeLegacy.colors.overlayPrimary,
      justifyContent: "center",
      alignItems: "center",
      marginRight: themeLegacy.spacing.sm,
    },
    rowLabel: {
      fontSize: themeLegacy.typography.fontSize.md,
      fontWeight: themeLegacy.typography.fontWeight.medium,
      color: theme.colors.text.primary,
    },
    rowSublabel: {
      fontSize: themeLegacy.typography.fontSize.xs,
      color: theme.colors.text.secondary,
      marginTop: 2,
    },
    infoBox: {
      flexDirection: "row",
      backgroundColor: theme.colors.background.elevated,
      padding: themeLegacy.spacing.md,
      borderRadius: theme.borderRadius.md,
      marginTop: themeLegacy.spacing.sm,
      gap: themeLegacy.spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border.light,
    },
    infoText: {
      flex: 1,
      fontSize: themeLegacy.typography.fontSize.xs,
      color: theme.colors.text.secondary,
      lineHeight: 18,
    },
  });
