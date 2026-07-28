/**
 * Recount Request Screen
 * Allows a supervisor to create a recount request for an observation.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useToast } from "../../src/components/feedback/ToastProvider";
import { ModernCard, AnimatedPressable, ScreenContainer } from "../../src/components/ui";
import { theme } from "../../src/styles/unifiedSystem";
import { createRecountRequest } from "../../src/services/api/approvalApi";

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
      router.back();
    } catch (error: any) {
      show(error?.message || "Failed to create recount request", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Request Recount</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <ModernCard style={styles.card}>
          <Text style={styles.label}>Scope</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
            {["ITEM", "BATCH", "SERIAL", "LOCATION", "SESSION"].map((item) => {
              const active = scope === item;
              return (
                <TouchableOpacity
                  key={item}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setScope(item)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={styles.label}>Reason</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Why is a recount required?"
            placeholderTextColor={theme.colors.textSecondary}
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setIsBlind((prev) => !prev)}
          >
            <View style={[styles.toggleBox, isBlind && styles.toggleBoxActive]}>
              <Ionicons
                name={isBlind ? "checkbox" : "square-outline"}
                size={20}
                color={theme.colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Blind recount</Text>
              <Text style={styles.toggleSubtitle}>
                Hide original count, variance, and remark from recounting staff
              </Text>
            </View>
          </TouchableOpacity>

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
    ...theme.typography.heading,
    color: theme.colors.text,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    gap: 12,
  },
  label: {
    ...theme.typography.body,
    color: theme.colors.text,
    fontWeight: "600",
  },
  chips: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  chipActive: {
    backgroundColor: theme.colors.primary + "18",
    borderColor: theme.colors.primary,
  },
  chipText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  chipTextActive: {
    color: theme.colors.primary,
    fontWeight: "600",
  },
  textArea: {
    ...theme.typography.body,
    color: theme.colors.text,
    backgroundColor: theme.colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
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
    ...theme.typography.body,
    color: theme.colors.text,
    fontWeight: "600",
  },
  toggleSubtitle: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  submitButton: {
    marginTop: 8,
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: theme.radius.lg,
    alignItems: "center",
  },
  submitButtonWeb: {
    maxWidth: 400,
    alignSelf: "center",
    width: "100%",
  },
  submitText: {
    color: "#fff",
    ...theme.typography.subtitle,
    fontWeight: "600",
  },
});
