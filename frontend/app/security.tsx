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
import {
  colors,
  spacing,
  typography,
  borderRadius,
} from "../src/theme/modernDesign";

export default function SecuritySettingsScreen() {
  const router = useRouter();
  const { pinSetup, isLoading } = useAuthStore();
  const { settings, setSetting } = useSettingsStore();

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

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
      <StatusBar style="dark" />
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
                    color={colors.primary[500]}
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
                  false: colors.gray[200],
                  true: colors.primary[500],
                }}
                thumbColor={colors.white}
              />
            </View>
          </ModernCard>
        </Animated.View>

        <View style={styles.infoBox}>
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={colors.gray[500]}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  scrollContent: {
    padding: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray[500],
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  description: {
    fontSize: typography.fontSize.sm,
    color: colors.gray[600],
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
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary[50],
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  rowLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.gray[900],
  },
  rowSublabel: {
    fontSize: typography.fontSize.xs,
    color: colors.gray[500],
    marginTop: 2,
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: colors.gray[100],
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: typography.fontSize.xs,
    color: colors.gray[600],
    lineHeight: 18,
  },
});
