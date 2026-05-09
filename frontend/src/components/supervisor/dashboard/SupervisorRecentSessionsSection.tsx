import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";

import { AnimatedPressable, ModernCard } from "@/components/ui";
import { useUiTokens } from "@/hooks/useUiTokens";
import { theme } from "@/styles/modernDesignSystem";
import { semanticColors } from "@/theme/legacyCompat";
import { Session } from "@/types";

interface SupervisorRecentSessionsSectionProps {
  onOpenSession: (sessionId: string) => void;
  onViewAll: () => void;
  sessions: Session[];
}

export function SupervisorRecentSessionsSection({
  onOpenSession,
  onViewAll,
  sessions,
}: SupervisorRecentSessionsSectionProps) {
  const uiTokens = useUiTokens();

  return (
    <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: uiTokens.colors.textPrimary }]}>
          Recent Sessions
        </Text>
        <AnimatedPressable onPress={onViewAll} hapticFeedback="light">
          <Text style={[styles.sectionLink, { color: uiTokens.colors.accentStrong }]}>
            View All
          </Text>
        </AnimatedPressable>
      </View>

      {sessions.slice(0, 3).map((session, index) => (
        <Animated.View key={session.id} entering={FadeInDown.delay(450 + index * 50).springify()}>
          <AnimatedPressable onPress={() => onOpenSession(session.id)} hapticFeedback="light">
            <ModernCard
              variant="outlined"
              elevation="sm"
              padding={theme.spacing.md}
              style={styles.sessionCard}
            >
              <View style={styles.sessionHeader}>
                <View style={styles.sessionInfo}>
                  <Text style={[styles.sessionWarehouse, { color: uiTokens.colors.textPrimary }]}>
                    {session.warehouse}
                  </Text>
                  <Text style={[styles.sessionStaff, { color: uiTokens.colors.textSecondary }]}>
                    {session.staff_name || "Unknown"}
                  </Text>
                  {session.barcode && (
                    <Text style={[styles.sessionBarcode, { color: uiTokens.colors.textMuted }]}>
                      {session.barcode}
                    </Text>
                  )}
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        session.status === "OPEN"
                          ? uiTokens.colors.warning
                          : session.status === "CLOSED"
                            ? uiTokens.colors.success
                            : uiTokens.colors.info,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      {
                        color:
                          session.status === "OPEN"
                            ? semanticColors.text.primary
                            : semanticColors.text.inverse,
                      },
                    ]}
                  >
                    {session.status}
                  </Text>
                </View>
              </View>

              <View style={styles.sessionStats}>
                <View style={styles.sessionStat}>
                  <Ionicons name="cube-outline" size={16} color={uiTokens.colors.textSecondary} />
                  <Text style={[styles.sessionStatText, { color: uiTokens.colors.textSecondary }]}>
                    {session.total_items} items
                  </Text>
                </View>
                <View style={styles.sessionStat}>
                  <Ionicons
                    name="analytics-outline"
                    size={16}
                    color={
                      Math.abs(session.total_variance) > 0
                        ? uiTokens.colors.error
                        : uiTokens.colors.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.sessionStatText,
                      {
                        color:
                          Math.abs(session.total_variance) > 0
                            ? uiTokens.colors.error
                            : uiTokens.colors.textSecondary,
                      },
                    ]}
                  >
                    Var: {session.total_variance}
                  </Text>
                </View>
              </View>
            </ModernCard>
          </AnimatedPressable>
        </Animated.View>
      ))}

      {sessions.length === 0 && (
        <ModernCard
          variant="outlined"
          elevation="sm"
          padding={theme.spacing.lg}
          style={styles.emptyCard}
        >
          <View style={styles.emptyState}>
            <Ionicons name="file-tray-outline" size={48} color={uiTokens.colors.textSecondary} />
            <Text style={[styles.emptyText, { color: uiTokens.colors.textSecondary }]}>
              No sessions available yet
            </Text>
          </View>
        </ModernCard>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: theme.spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "600",
  },
  sectionLink: {
    fontSize: 14,
    fontWeight: "600",
  },
  sessionCard: {
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
  },
  emptyCard: {
    borderRadius: theme.borderRadius.lg,
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: theme.spacing.md,
  },
  sessionInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  sessionWarehouse: {
    fontSize: 16,
    fontWeight: "600",
  },
  sessionStaff: {
    fontSize: 14,
  },
  sessionBarcode: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  sessionStats: {
    flexDirection: "row",
    gap: theme.spacing.lg,
  },
  sessionStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  sessionStatText: {
    fontSize: 14,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  emptyText: {
    textAlign: "center",
    fontSize: 16,
  },
});
