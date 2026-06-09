/**
 * Terminal state shown by the staff scan screen when it is opened without a
 * valid session link. Extracted from scan.tsx to keep the screen focused on the
 * active scanning flow. Self-contained: navigation, tokens, and flags are read
 * here rather than threaded as props.
 */

import React from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import ModernHeader from "@/components/ui/ModernHeader";
import ModernButton from "@/components/ui/ModernButton";
import { useUiTokens } from "@/hooks/useUiTokens";
import { getTokenShadowStyle } from "@/theme/themeTokens";
import { flags } from "@/constants/flags";
import { styles } from "@/styles/screens/Scan.styles";

export function ScanMissingSession() {
  const router = useRouter();
  const uiTokens = useUiTokens();
  const scanVisualV2Enabled = flags.uiVisualSystemV2 && flags.uiScanV2;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: uiTokens.colors.background }]}
      edges={["top"]}
    >
      <ModernHeader
        title="Scan Session Required"
        subtitle="Open scan from an active count session"
        showBackButton
        showSettingsButton={false}
        onBackPress={() => router.replace("/staff/home")}
      />
      <View style={styles.missingSessionContainer}>
        <View
          style={[
            styles.missingSessionCard,
            {
              backgroundColor: uiTokens.colors.surface,
              borderColor: uiTokens.colors.border,
            },
            scanVisualV2Enabled ? getTokenShadowStyle(uiTokens, "sm") : null,
          ]}
        >
          <Ionicons name="alert-circle-outline" size={32} color={uiTokens.colors.warning} />
          <Text style={[styles.missingSessionTitle, { color: uiTokens.colors.textPrimary }]}>
            Session link is incomplete
          </Text>
          <Text style={[styles.missingSessionBody, { color: uiTokens.colors.textSecondary }]}>
            This scan screen needs a valid session link. Start a new session or resume one from
            Staff Home.
          </Text>
          <View style={styles.missingSessionActions}>
            <ModernButton
              title="Open Staff Home"
              onPress={() => router.replace("/staff/home")}
              variant="primary"
              fullWidth
            />
            {flags.uiAuthRedirectV2 && (
              <ModernButton
                title="Go to Login"
                onPress={() => router.replace("/login")}
                variant="outline"
                fullWidth
              />
            )}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default ScanMissingSession;
