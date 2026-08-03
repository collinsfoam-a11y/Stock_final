/**
 * Supervisor Observation Detail Screen
 * Displays full observation details for supervisor review.
 */

import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Platform, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { legacyTheme as theme } from "@/theme/unified";
import { useToast } from "../../src/components/feedback/ToastProvider";
import { supervisorDecide, type SupervisorDecidePayload } from "../../src/services/api/approvalApi";
import { safeBackNavigation } from "@/utils/navigation";

import { AppTouchable } from "@/components/ui/AppTouchable";
import { ModernCard } from "@/components/ui/ModernCard";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { ScreenContainer } from "@/components/ui/ScreenContainer";

export default function ObservationDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ observationId?: string }>();
  const { show } = useToast();
  const [loading, setLoading] = useState(true);
  const [observation, setObservation] = useState<any>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    setTimeout(() => {
      if (!cancelled) {
        setObservation({
          observation_id: params.observationId,
          system_recommendation: "SUPERVISOR_REVIEW",
          physical_qty: 0,
          sql_qty_at_submission: 0,
          variance: 0,
          exception_types: [],
          mandatory_remark: "",
          photos: [],
          previous_count_versions: [],
        });
        setLoading(false);
      }
    }, 100);

    return () => {
      cancelled = true;
    };
  }, [params.observationId]);

  const handleDecision = async (action: string) => {
    if (!params.observationId) return;
    setProcessing(true);
    try {
      await supervisorDecide(params.observationId, {
        action,
        reason: `Supervisor ${action.toLowerCase()} from detail view`,
      });
      show(`Observation ${action.toLowerCase()}`, "success");
      safeBackNavigation(router);
    } catch (error: any) {
      show(error?.message || "Decision failed", "error");
    } finally {
      setProcessing(false);
    }
  };

  const confirmDecision = (action: string) => {
    Alert.alert(
      `Confirm ${action}`,
      "Supervisor actions are audit-logged and cannot be silently reverted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: action,
          style: "destructive",
          onPress: () => handleDecision(action),
        },
      ],
    );
  };

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary[500]} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <AppTouchable
          onPress={() => safeBackNavigation(router)}
          hitSlop={12}
          accessibilityLabel="Previous">
          <Ionicons name="chevron-back" size={24} color={theme.colors.text.primary} />
        </AppTouchable>
        <Text style={styles.title}>Observation Detail</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <ModernCard style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Observation</Text>
            <Text style={styles.value}>{params.observationId}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Recommendation</Text>
            <Text style={[styles.value, { color: theme.colors.warning.main }]}>
              {observation?.system_recommendation || "—"}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Physical</Text>
            <Text style={styles.value}>{observation?.physical_qty ?? "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>SQL at Submission</Text>
            <Text style={styles.value}>{observation?.sql_qty_at_submission ?? "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Variance</Text>
            <Text style={[styles.value, { color: theme.colors.error.main }]}>
              {observation?.variance ?? "—"}
            </Text>
          </View>
        </ModernCard>

        <ModernCard style={styles.card}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.actions}>
            <AnimatedPressable
              style={[styles.actionButton, styles.approveButton]}
              onPress={() => confirmDecision("APPROVE")}
              disabled={processing}
            >
              <Text style={styles.approveText}>Approve</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => confirmDecision("REJECT")}
              disabled={processing}
            >
              <Text style={styles.rejectText}>Reject</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.actionButton, styles.recountButton]}
              onPress={() =>
                router.push({
                  pathname: "/(app)/supervisor/recount-request",
                  params: { observationId: params.observationId },
                } as any)
              }
              disabled={processing}
            >
              <Text style={styles.recountText}>Recount</Text>
            </AnimatedPressable>
          </View>
        </ModernCard>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    ...theme.typography.h4,
    color: theme.colors.text.primary,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    gap: 10,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    ...theme.typography.body.small,
    color: theme.colors.text.secondary,
  },
  value: {
    ...theme.typography.body.small,
    color: theme.colors.text.primary,
    fontWeight: "600",
  },
  sectionTitle: {
    ...theme.typography.h6,
    color: theme.colors.text.primary,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    ...(Platform.OS === "web" ? { flexWrap: "wrap" } : {}),
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    ...(Platform.OS === "web" ? { minWidth: 120 } : {}),
  },
  approveButton: {
    backgroundColor: theme.colors.success.main + "18",
  },
  approveText: {
    color: theme.colors.success.main,
    fontWeight: "600",
  },
  rejectButton: {
    backgroundColor: theme.colors.error.main + "18",
  },
  rejectText: {
    color: theme.colors.error.main,
    fontWeight: "600",
  },
  recountButton: {
    backgroundColor: theme.colors.primary[500] + "18",
  },
  recountText: {
    color: theme.colors.primary[500],
    fontWeight: "600",
  },
});
