/**
 * Recount Request Screen
 * Allows a supervisor to create a recount request for an observation.
 */

import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, ScrollView, Alert, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useToast } from "../../src/components/feedback/ToastProvider";
import { legacyTheme as theme } from "@/theme/unified";
import { createRecountRequest } from "../../src/services/api/approvalApi";
import { safeBackNavigation } from "@/utils/navigation";

import { AppTouchable } from "@/components/ui/AppTouchable";
import { ModernCard } from "@/components/ui/ModernCard";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { SyncStatusPill } from "@/components/ui/SyncStatusPill";

export default function RecountRequestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ observationId?: string }>();
  const { show } = useToast();
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState("ITEM");
  const [isBlind, setIsBlind] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!params.observationId) {
      show("Missing observation id", "error");
      return;
    }
    const trimmed = reason.trim();
    if (!trimmed) {
      show("Recount reason is required", "error");
      return;
    }

    setSubmitting(true);
    try {
      await createRecountRequest({
        observation_id: params.observationId,
        request_reason: trimmed,
        scope,
        is_blind: isBlind,
      });
      show("Recount request created", "success");
      safeBackNavigation(router);
    } catch (error: any) {
      show(error?.message || "Failed to create recount request", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <AppTouchable
          onPress={() => safeBackNavigation(router)}
          hitSlop={12}
          accessibilityLabel="Previous">
          <Ionicons name="chevron-back" size={24} color={theme.colors.text.primary} />
        </AppTouchable>
        <Text style={styles.screenTitle}>Request Recount</Text>
        <View style={{ marginLeft: "auto" }}>
          <SyncStatusPill />
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <ModernCard style={styles.card}>
          <Text style={styles.label}>Scope</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
            {["ITEM", "BATCH", "SERIAL", "LOCATION", "SESSION"].map((item) => {
              const active = scope === item;
              return (
                <AppTouchable
                  key={item}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setScope(item)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
                </AppTouchable>
              );
            })}
          </ScrollView>

          <Text style={styles.label}>Reason</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Why is a recount required?"
            placeholderTextColor={theme.colors.text.secondary}
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          <AppTouchable
            style={styles.toggleRow}
            onPress={() => setIsBlind((prev) => !prev)}
            accessibilityLabel="Toggle blind recount">
            <View style={[styles.toggleBox, isBlind && styles.toggleBoxActive]}>
              <Ionicons
                name={isBlind ? "checkbox" : "square-outline"}
                size={20}
                color={theme.colors.primary[500]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Blind recount</Text>
              <Text style={styles.toggleSubtitle}>
                Hide original count, variance, and remark from recounting staff
              </Text>
            </View>
          </AppTouchable>

          <AnimatedPressable
            style={[styles.submitButton, Platform.select({ web: styles.submitButtonWeb })]}
            onPress={submit}
            disabled={submitting}
          >
            <Text style={styles.submitText}>{submitting ? "Submitting..." : "Submit Request"}</Text>
          </AnimatedPressable>
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
  screenTitle: {
    ...theme.typography.h4,
    color: theme.colors.text.primary,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    gap: 12,
  },
  label: {
    ...theme.typography.body.medium,
    color: theme.colors.text.primary,
    fontWeight: "600",
  },
  chips: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border.light,
  },
  chipActive: {
    backgroundColor: theme.colors.primary[500] + "18",
    borderColor: theme.colors.primary[500],
  },
  chipText: {
    ...theme.typography.label,
    color: theme.colors.text.secondary,
  },
  chipTextActive: {
    color: theme.colors.primary[500],
    fontWeight: "600",
  },
  textArea: {
    ...theme.typography.body.medium,
    color: theme.colors.text.primary,
    backgroundColor: theme.colors.surface.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border.light,
    borderRadius: theme.borderRadius.lg,
    padding: 12,
    minHeight: 120,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  toggleBox: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleBoxActive: {},
  toggleTitle: {
    ...theme.typography.body.medium,
    color: theme.colors.text.primary,
    fontWeight: "600",
  },
  toggleSubtitle: {
    ...theme.typography.label,
    color: theme.colors.text.secondary,
    marginTop: 2,
  },
  submitButton: {
    marginTop: 8,
    backgroundColor: theme.colors.primary[500],
    paddingVertical: 14,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
  },
  submitButtonWeb: {
    maxWidth: 400,
    alignSelf: "center",
    width: "100%",
  },
  submitText: {
    color: theme.colors.text.inverse,
    ...theme.typography.h6,
    fontWeight: "600",
  },
});
