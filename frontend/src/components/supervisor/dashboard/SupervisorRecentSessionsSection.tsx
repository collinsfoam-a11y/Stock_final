import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeInDown } from "react-native-reanimated";

import {
  AnimatedPressable,
  GlassCard,
} from "@/components/ui";
import { theme } from "@/styles/modernDesignSystem";
import { colors as unifiedColors } from "@/theme/unified";
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
  return (
    <Animated.View
      entering={FadeInDown.delay(400).springify()}
      style={styles.section}
    >
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Sessions</Text>
        <AnimatedPressable onPress={onViewAll} hapticFeedback="light">
          <Text style={styles.sectionLink}>View All</Text>
        </AnimatedPressable>
      </View>

      {sessions.slice(0, 3).map((session, index) => (
        <Animated.View
          key={session.id}
          entering={FadeInDown.delay(450 + index * 50).springify()}
        >
          <AnimatedPressable
            onPress={() => onOpenSession(session.id)}
            hapticFeedback="light"
          >
            <GlassCard
              variant="medium"
              intensity={25}
              borderRadius={theme.borderRadius.lg}
              padding={theme.spacing.md}
              elevation="md"
              style={styles.sessionCard}
            >
              <View style={styles.sessionHeader}>
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionWarehouse}>{session.warehouse}</Text>
                  <Text style={styles.sessionStaff}>
                    {session.staff_name || "Unknown"}
                  </Text>
                  {session.barcode && (
                    <Text style={styles.sessionBarcode}>{session.barcode}</Text>
                  )}
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        session.status === "OPEN"
                          ? theme.colors.warning.main
                          : session.status === "CLOSED"
                            ? theme.colors.success.main
                            : theme.colors.secondary[500],
                    },
                  ]}
                >
                  <Text style={styles.statusText}>{session.status}</Text>
                </View>
              </View>

              <View style={styles.sessionStats}>
                <View style={styles.sessionStat}>
                  <Ionicons
                    name="cube-outline"
                    size={16}
                    color={theme.colors.text.secondary}
                  />
                  <Text style={styles.sessionStatText}>
                    {session.total_items} items
                  </Text>
                </View>
                <View style={styles.sessionStat}>
                  <Ionicons
                    name="analytics-outline"
                    size={16}
                    color={
                      Math.abs(session.total_variance) > 0
                        ? theme.colors.error.main
                        : theme.colors.text.secondary
                    }
                  />
                  <Text
                    style={[
                      styles.sessionStatText,
                      Math.abs(session.total_variance) > 0 && styles.varianceText,
                    ]}
                  >
                    Var: {session.total_variance}
                  </Text>
                </View>
              </View>
            </GlassCard>
          </AnimatedPressable>
        </Animated.View>
      ))}

      {sessions.length === 0 && (
        <GlassCard
          variant="medium"
          intensity={25}
          borderRadius={theme.borderRadius.lg}
          padding={theme.spacing.lg}
          elevation="md"
        >
          <View style={styles.emptyState}>
            <Ionicons
              name="file-tray-outline"
              size={48}
              color={theme.colors.text.secondary}
            />
            <Text style={styles.emptyText}>No sessions available yet</Text>
          </View>
        </GlassCard>
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
    color: theme.colors.text.primary,
  },
  sectionLink: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.primary[500],
  },
  sessionCard: {
    marginBottom: theme.spacing.md,
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
    color: theme.colors.text.primary,
  },
  sessionStaff: {
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  sessionBarcode: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.text.tertiary,
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    color: unifiedColors.white,
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
    color: theme.colors.text.secondary,
  },
  varianceText: {
    color: theme.colors.error.main,
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
    color: theme.colors.text.secondary,
  },
});
