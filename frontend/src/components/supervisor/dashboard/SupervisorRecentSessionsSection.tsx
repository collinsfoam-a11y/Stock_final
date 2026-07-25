import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";

import { AnimatedPressable, ModernCard } from "@/components/ui";
import { useUiTokens } from "@/hooks/useUiTokens";
import { semanticColors } from "@/theme/legacyCompat";
import { font, gap, radius } from "@/theme/staffUiScale";
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
              padding={gap.md}
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
          padding={gap.lg}
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
    marginBottom: gap.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: gap.md,
  },
  sectionTitle: {
    fontSize: font.size.xl,
    fontWeight: font.weight.semibold,
  },
  sectionLink: {
    fontSize: font.size.base,
    fontWeight: font.weight.semibold,
  },
  sessionCard: {
    marginBottom: gap.md,
    borderRadius: radius.lg,
  },
  emptyCard: {
    borderRadius: radius.lg,
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: gap.md,
  },
  sessionInfo: {
    flex: 1,
    gap: gap.xs,
  },
  sessionWarehouse: {
    fontSize: font.size.lg,
    fontWeight: font.weight.semibold,
  },
  sessionStaff: {
    fontSize: font.size.base,
  },
  sessionBarcode: {
    marginTop: 2,
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
  },
  statusBadge: {
    paddingHorizontal: gap.sm,
    paddingVertical: gap.xs,
    borderRadius: radius.full,
  },
  statusText: {
    fontSize: font.size.sm,
    fontWeight: font.weight.bold,
  },
  sessionStats: {
    flexDirection: "row",
    gap: gap.lg,
  },
  sessionStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: gap.xs,
  },
  sessionStatText: {
    fontSize: font.size.base,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: gap.xl,
    gap: gap.md,
  },
  emptyText: {
    textAlign: "center",
    fontSize: font.size.lg,
  },
});
